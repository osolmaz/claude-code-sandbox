import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import Docker from 'dockerode';
import chalk from 'chalk';

interface SessionInfo {
  containerId: string;
  stream?: any;
  connectedSockets: Set<string>;
}

export class WebUIServer {
  private app: express.Application;
  private httpServer: any;
  private io: Server;
  private docker: Docker;
  private sessions: Map<string, SessionInfo> = new Map();
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
            // Attach to the container's main process
            console.log(chalk.blue('Attaching to container...'));
            
            const stream = await container.attach({
              stream: true,
              stdin: true,
              stdout: true,
              stderr: true,
              hijack: true
            });
            
            session = { 
              containerId, 
              stream,
              connectedSockets: new Set([socket.id])
            };
            this.sessions.set(containerId, session);
            
            // Set up stream handlers
            stream.on('data', (chunk: Buffer) => {
              // Docker attach streams don't have the same header format as exec
              // Just forward the data as-is
              if (chunk.length > 0) {
                for (const socketId of session!.connectedSockets) {
                  const connectedSocket = this.io.sockets.sockets.get(socketId);
                  if (connectedSocket) {
                    connectedSocket.emit('output', new Uint8Array(chunk));
                  }
                }
              }
            });
            
            stream.on('error', (err: Error) => {
              console.error(chalk.red('Stream error:'), err);
              for (const socketId of session!.connectedSockets) {
                const connectedSocket = this.io.sockets.sockets.get(socketId);
                if (connectedSocket) {
                  connectedSocket.emit('error', { message: err.message });
                }
              }
            });
            
            stream.on('end', () => {
              for (const socketId of session!.connectedSockets) {
                const connectedSocket = this.io.sockets.sockets.get(socketId);
                if (connectedSocket) {
                  connectedSocket.emit('container-disconnected');
                }
              }
              this.sessions.delete(containerId);
            });
            
            console.log(chalk.green('Attached to container'));
          } else {
            // Add this socket to the existing session
            console.log(chalk.blue('Reconnecting to existing session'));
            session.connectedSockets.add(socket.id);
          }

          // Confirm attachment
          socket.emit('attached', { containerId });
          
          // Container attach doesn't support resize like exec does
          // But we can try to send a resize sequence through stdin
          if (data.cols && data.rows) {
            setTimeout(() => {
              // Send terminal resize escape sequence
              const resizeSeq = `\x1b[8;${data.rows};${data.cols}t`;
              if (session && session.stream) {
                session.stream.write(resizeSeq);
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
          if (session.connectedSockets.has(socket.id) && session.stream) {
            // Send resize escape sequence
            const resizeSeq = `\x1b[8;${rows};${cols}t`;
            session.stream.write(resizeSeq);
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
        
        // Remove socket from all sessions but don't close the stream
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
      const open = (await import('open')).default;
      await open(url);
      console.log(chalk.blue('✓ Opened browser'));
    } catch (error) {
      console.log(chalk.yellow('Could not open browser automatically'));
      console.log(chalk.yellow(`Please open ${url} in your browser`));
    }
  }
}