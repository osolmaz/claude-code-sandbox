import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import * as fs from 'fs-extra';
import Docker from 'dockerode';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ShadowRepository } from './git/shadow-repository';

const execAsync = promisify(exec);

interface SessionInfo {
  containerId: string;
  exec?: any;
  stream?: any;
  connectedSockets: Set<string>;  // Track connected sockets
  outputHistory?: Buffer[];  // Store output history for replay
}

export class WebUIServer {
  private app: express.Application;
  private httpServer: any;
  private io: Server;
  private docker: Docker;
  private sessions: Map<string, SessionInfo> = new Map(); // container -> session mapping
  private port: number = 3456;
  private shadowRepos: Map<string, ShadowRepository> = new Map(); // container -> shadow repo
  private syncInProgress: Set<string> = new Set(); // Track containers currently syncing
  private originalRepo: string = '';
  private currentBranch: string = 'main';
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map(); // container -> monitoring interval

  constructor(docker: Docker) {
    this.docker = docker;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Health check endpoint
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Container info endpoint
    this.app.get('/api/containers', async (_req, res) => {
      try {
        const containers = await this.docker.listContainers();
        const claudeContainers = containers.filter(c => 
          c.Names.some(name => name.includes('claude-code-sandbox'))
        );
        res.json(claudeContainers);
      } catch (error) {
        res.status(500).json({ error: 'Failed to list containers' });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(chalk.blue('✓ Client connected to web UI'));

      socket.on('attach', async (data) => {
        const { containerId } = data;
        
        try {
          const container = this.docker.getContainer(containerId);
          
          // Check if we already have a session for this container
          let session = this.sessions.get(containerId);
          
          if (!session || !session.stream) {
            // No existing session, create a new one
            console.log(chalk.blue('Creating new Claude session...'));
            const exec = await container.exec({
              AttachStdin: true,
              AttachStdout: true,
              AttachStderr: true,
              Tty: true,
              Cmd: ['claude', '--dangerously-skip-permissions'],
              WorkingDir: '/workspace',
              User: 'claude',
              Env: [
                'TERM=xterm-256color',
                'COLORTERM=truecolor'
              ]
            });

            const stream = await exec.start({
              hijack: true,
              stdin: true
            });
            
            session = { 
              containerId, 
              exec, 
              stream,
              connectedSockets: new Set([socket.id]),
              outputHistory: []
            };
            this.sessions.set(containerId, session);
            
            // Set up stream handlers that broadcast to all connected sockets
            stream.on('data', (chunk: Buffer) => {
              // Process and broadcast to all connected sockets for this session
              let dataToSend: Buffer;
              
              if (chunk.length > 8) {
                const firstByte = chunk[0];
                if (firstByte >= 1 && firstByte <= 3) {
                  dataToSend = chunk.slice(8);
                } else {
                  dataToSend = chunk;
                }
              } else {
                dataToSend = chunk;
              }
              
              if (dataToSend.length > 0) {
                // Store in history (limit to last 100KB)
                if (session!.outputHistory) {
                  session!.outputHistory.push(Buffer.from(dataToSend));
                  const totalSize = session!.outputHistory.reduce((sum, buf) => sum + buf.length, 0);
                  while (totalSize > 100000 && session!.outputHistory.length > 1) {
                    session!.outputHistory.shift();
                  }
                }
                
                // Broadcast to all connected sockets for this container
                for (const socketId of session!.connectedSockets) {
                  const connectedSocket = this.io.sockets.sockets.get(socketId);
                  if (connectedSocket) {
                    connectedSocket.emit('output', new Uint8Array(dataToSend));
                  }
                }
              }
            });
            
            stream.on('error', (err: Error) => {
              console.error(chalk.red('Stream error:'), err);
              // Notify all connected sockets
              for (const socketId of session!.connectedSockets) {
                const connectedSocket = this.io.sockets.sockets.get(socketId);
                if (connectedSocket) {
                  connectedSocket.emit('error', { message: err.message });
                }
              }
            });
            
            stream.on('end', () => {
              // Notify all connected sockets
              for (const socketId of session!.connectedSockets) {
                const connectedSocket = this.io.sockets.sockets.get(socketId);
                if (connectedSocket) {
                  connectedSocket.emit('container-disconnected');
                }
              }
              // Stop continuous monitoring
              this.stopContinuousMonitoring(containerId);
              // Clean up session and shadow repo
              this.sessions.delete(containerId);
              if (this.shadowRepos.has(containerId)) {
                this.shadowRepos.get(containerId)?.cleanup();
                this.shadowRepos.delete(containerId);
              }
            });
            
            console.log(chalk.green('New Claude session started'));
            
            // Start continuous monitoring for this container
            this.startContinuousMonitoring(containerId);
          } else {
            // Add this socket to the existing session
            console.log(chalk.blue('Reconnecting to existing Claude session'));
            session.connectedSockets.add(socket.id);
            
            // Replay output history to the reconnecting client
            if (session.outputHistory && session.outputHistory.length > 0) {
              console.log(chalk.blue(`Replaying ${session.outputHistory.length} output chunks`));
              // Send a clear screen first
              socket.emit('output', new Uint8Array(Buffer.from('\x1b[2J\x1b[H')));
              // Then replay the history
              for (const chunk of session.outputHistory) {
                socket.emit('output', new Uint8Array(chunk));
              }
            }
          }

          // Confirm attachment
          socket.emit('attached', { containerId });
          
          // Send initial resize after a small delay
          if (session.exec && data.cols && data.rows) {
            setTimeout(async () => {
              try {
                await session.exec.resize({ w: data.cols, h: data.rows });
              } catch (e) {
                // Ignore resize errors
              }
            }, 100);
          }

        } catch (error: any) {
          console.error(chalk.red('Failed to attach to container:'), error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('resize', async (data) => {
        const { cols, rows } = data;
        
        // Find which session this socket belongs to
        for (const [, session] of this.sessions) {
          if (session.connectedSockets.has(socket.id) && session.exec) {
            try {
              await session.exec.resize({ w: cols, h: rows });
            } catch (error) {
              console.error(chalk.yellow('Failed to resize terminal:'), error);
            }
            break;
          }
        }
      });

      socket.on('input', (data) => {
        // Find which session this socket belongs to
        for (const [, session] of this.sessions) {
          if (session.connectedSockets.has(socket.id) && session.stream) {
            session.stream.write(data);
            break;
          }
        }
      });

      // Test handler to verify socket connectivity
      socket.on('test-sync', (data) => {
        console.log(chalk.yellow(`[TEST] Received test-sync event:`, data));
      });

      // input-needed handler removed - now using continuous monitoring

      // Handle commit operation
      socket.on('commit-changes', async (data) => {
        const { containerId, commitMessage } = data;
        
        try {
          const shadowRepo = this.shadowRepos.get(containerId);
          if (!shadowRepo) {
            throw new Error('Shadow repository not found');
          }
          
          const shadowPath = shadowRepo.getPath();
          
          // Stage all changes
          await execAsync('git add .', { cwd: shadowPath });
          
          // Create commit
          await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { 
            cwd: shadowPath 
          });
          
          console.log(chalk.green('✓ Changes committed'));
          socket.emit('commit-success', { message: 'Changes committed successfully' });
          
        } catch (error: any) {
          console.error(chalk.red('Commit failed:'), error);
          socket.emit('commit-error', { message: error.message });
        }
      });

      // Handle push operation  
      socket.on('push-changes', async (data) => {
        const { containerId, branchName } = data;
        
        try {
          const shadowRepo = this.shadowRepos.get(containerId);
          if (!shadowRepo) {
            throw new Error('Shadow repository not found');
          }
          
          const shadowPath = shadowRepo.getPath();
          
          // Create and switch to new branch if specified
          if (branchName && branchName !== 'main') {
            try {
              await execAsync(`git checkout -b ${branchName}`, { cwd: shadowPath });
            } catch (error) {
              // Branch might already exist, try to switch
              await execAsync(`git checkout ${branchName}`, { cwd: shadowPath });
            }
          }
          
          // Push to remote
          const { stdout: remoteOutput } = await execAsync('git remote -v', { cwd: shadowPath });
          if (remoteOutput.includes('origin')) {
            // Get current branch name if not specified
            const pushBranch = branchName || await execAsync('git branch --show-current', { cwd: shadowPath }).then(r => r.stdout.trim());
            await execAsync(`git push -u origin ${pushBranch}`, { cwd: shadowPath });
            console.log(chalk.green('✓ Changes pushed to remote'));
            socket.emit('push-success', { message: 'Changes pushed successfully' });
          } else {
            throw new Error('No remote origin configured');
          }
          
        } catch (error: any) {
          console.error(chalk.red('Push failed:'), error);
          socket.emit('push-error', { message: error.message });
        }
      });

      socket.on('disconnect', () => {
        console.log(chalk.yellow('Client disconnected from web UI'));
        
        // Remove socket from all sessions
        for (const [, session] of this.sessions) {
          session.connectedSockets.delete(socket.id);
        }
      });
    });
  }

  private async performSync(containerId: string): Promise<void> {
    if (this.syncInProgress.has(containerId)) {
      return; // Skip if sync already in progress
    }
    
    this.syncInProgress.add(containerId);
    
    try {
      // Initialize shadow repo if not exists
      if (!this.shadowRepos.has(containerId)) {
        const shadowRepo = new ShadowRepository({
          originalRepo: this.originalRepo || process.cwd(),
          claudeBranch: this.currentBranch || 'claude-changes',
          sessionId: containerId.substring(0, 12)
        });
        this.shadowRepos.set(containerId, shadowRepo);
      }
      
      // Sync files from container
      const shadowRepo = this.shadowRepos.get(containerId)!;
      await shadowRepo.syncFromContainer(containerId);
      
      // Check if shadow repo actually has git initialized
      const shadowPath = shadowRepo.getPath();
      const gitPath = path.join(shadowPath, '.git');
      
      if (!await fs.pathExists(gitPath)) {
        console.log(chalk.yellow('Shadow repository .git directory missing - skipping sync'));
        return;
      }
      
      // Get changes summary and diff data
      const changes = await shadowRepo.getChanges();
      let diffData = null;
      
      if (changes.hasChanges) {
        // Get detailed file status and diffs
        const { stdout: statusOutput } = await execAsync('git status --porcelain', { 
          cwd: shadowPath 
        });
        
        // Try git diff HEAD first, fallback to git diff if no HEAD
        let diffOutput = '';
        try {
          const { stdout } = await execAsync('git diff HEAD', { 
            cwd: shadowPath,
            maxBuffer: 10 * 1024 * 1024 // 10MB limit
          });
          diffOutput = stdout;
        } catch (headError) {
          try {
            // Fallback to git diff (shows unstaged changes)
            const { stdout } = await execAsync('git diff', { 
              cwd: shadowPath,
              maxBuffer: 10 * 1024 * 1024 // 10MB limit
            });
            diffOutput = stdout;
          } catch (diffError) {
            console.log(chalk.gray('  Could not generate diff, skipping...'));
            diffOutput = 'Could not generate diff';
          }
        }
        
        // Get list of untracked files with their content
        const untrackedFiles: string[] = [];
        const statusLines = statusOutput.split('\n').filter(line => line.startsWith('??'));
        for (const line of statusLines) {
          const filename = line.substring(3);
          untrackedFiles.push(filename);
        }
        
        diffData = {
          status: statusOutput,
          diff: diffOutput,
          untrackedFiles: untrackedFiles
        };
        
        console.log(chalk.cyan(`[MONITOR] Changes detected: ${changes.summary}`));
      }
      
      const syncCompleteData = {
        hasChanges: changes.hasChanges,
        summary: changes.summary,
        shadowPath: shadowPath,
        diffData: diffData,
        containerId: containerId
      };
      
      // Send to all connected sockets for this container
      const session = this.sessions.get(containerId);
      if (session) {
        for (const socketId of session.connectedSockets) {
          const connectedSocket = this.io.sockets.sockets.get(socketId);
          if (connectedSocket) {
            connectedSocket.emit('sync-complete', syncCompleteData);
          }
        }
      }
      
    } catch (error: any) {
      console.error(chalk.red('[MONITOR] Sync failed:'), error);
      const session = this.sessions.get(containerId);
      if (session) {
        for (const socketId of session.connectedSockets) {
          const connectedSocket = this.io.sockets.sockets.get(socketId);
          if (connectedSocket) {
            connectedSocket.emit('sync-error', { message: error.message });
          }
        }
      }
    } finally {
      this.syncInProgress.delete(containerId);
    }
  }

  private startContinuousMonitoring(containerId: string): void {
    // Clear existing interval if any
    if (this.monitoringIntervals.has(containerId)) {
      clearInterval(this.monitoringIntervals.get(containerId)!);
    }
    
    console.log(chalk.blue(`[MONITOR] Starting continuous monitoring for container ${containerId.substring(0, 12)}`));
    
    // Start monitoring every 3 seconds
    const interval = setInterval(async () => {
      await this.performSync(containerId);
    }, 3000);
    
    this.monitoringIntervals.set(containerId, interval);
  }

  private stopContinuousMonitoring(containerId: string): void {
    if (this.monitoringIntervals.has(containerId)) {
      clearInterval(this.monitoringIntervals.get(containerId)!);
      this.monitoringIntervals.delete(containerId);
      console.log(chalk.blue(`[MONITOR] Stopped monitoring for container ${containerId.substring(0, 12)}`));
    }
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        const url = `http://localhost:${this.port}`;
        console.log(chalk.green(`✓ Web UI server started at ${url}`));
        resolve(url);
      });

      this.httpServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Try next port
          this.port++;
          this.httpServer.listen(this.port, () => {
            const url = `http://localhost:${this.port}`;
            console.log(chalk.green(`✓ Web UI server started at ${url}`));
            resolve(url);
          });
        } else {
          reject(err);
        }
      });
    });
  }

  setRepoInfo(originalRepo: string, branch: string): void {
    this.originalRepo = originalRepo;
    this.currentBranch = branch;
  }

  async stop(): Promise<void> {
    // Clean up shadow repos
    for (const [, shadowRepo] of this.shadowRepos) {
      await shadowRepo.cleanup();
    }
    
    // Clean up all sessions
    for (const [, session] of this.sessions) {
      if (session.stream) {
        session.stream.end();
      }
    }
    this.sessions.clear();

    // Close socket.io connections
    this.io.close();

    // Close HTTP server
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        console.log(chalk.yellow('Web UI server stopped'));
        resolve();
      });
    });
  }

  async openInBrowser(url: string): Promise<void> {
    try {
      // Try the open module first
      const open = (await import('open')).default;
      await open(url);
      console.log(chalk.blue('✓ Opened browser'));
      return;
    } catch (error) {
      // Fallback to platform-specific commands
      try {
        const { execSync } = require('child_process');
        const platform = process.platform;
        
        if (platform === 'darwin') {
          execSync(`open "${url}"`, { stdio: 'ignore' });
        } else if (platform === 'win32') {
          execSync(`start "" "${url}"`, { stdio: 'ignore' });
        } else {
          // Linux/Unix
          execSync(`xdg-open "${url}" || firefox "${url}" || google-chrome "${url}"`, { stdio: 'ignore' });
        }
        console.log(chalk.blue('✓ Opened browser'));
        return;
      } catch (fallbackError) {
        console.log(chalk.yellow('Could not open browser automatically'));
        console.log(chalk.yellow(`Please open ${url} in your browser`));
      }
    }
  }
}