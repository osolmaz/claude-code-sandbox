import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import Docker from 'dockerode';
import chalk from 'chalk';

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
              // Clean up session
              this.sessions.delete(containerId);
            });
            
            console.log(chalk.green('New Claude session started'));
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

      socket.on('disconnect', () => {
        console.log(chalk.yellow('Client disconnected from web UI'));
        
        // Remove socket from all sessions
        for (const [, session] of this.sessions) {
          session.connectedSockets.delete(socket.id);
        }
      });
    });
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

  async stop(): Promise<void> {
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