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
}

export class WebUIServer {
  private app: express.Application;
  private httpServer: any;
  private io: Server;
  private docker: Docker;
  private activeStreams: Map<string, any> = new Map();
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
            // No existing session, attach to container's main TTY
            console.log(chalk.blue('Attaching to container TTY...'));
            
            // Always use exec to create a new interactive session
            console.log(chalk.blue('Creating interactive session...'));
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
            
            session = { containerId, exec, stream };
            this.sessions.set(containerId, session);
            
            console.log(chalk.green('Claude started successfully'));
          }
          
          // Store stream reference for this socket
          this.activeStreams.set(socket.id, { 
            stream: session.stream, 
            exec: session.exec,
            containerId 
          });

          // Set up data handler for this specific socket
          const dataHandler = (chunk: Buffer) => {
            // Docker hijacked streams have a special format with headers
            // We need to strip these headers to get the actual data
            if (chunk.length > 8) {
              // Check if this looks like a Docker header (first byte is 1, 2, or 3)
              const firstByte = chunk[0];
              if (firstByte >= 1 && firstByte <= 3) {
                // This is likely a Docker header, skip the first 8 bytes
                const data = chunk.slice(8);
                if (data.length > 0) {
                  // Convert Buffer to Uint8Array for proper transmission
                  socket.emit('output', new Uint8Array(data));
                }
              } else {
                // No header, send as-is
                socket.emit('output', new Uint8Array(chunk));
              }
            } else {
              // Small chunk, send as-is
              socket.emit('output', new Uint8Array(chunk));
            }
          };
          
          const errorHandler = (err: Error) => {
            console.error(chalk.red('Stream error:'), err);
            socket.emit('error', { message: err.message });
          };
          
          const endHandler = () => {
            socket.emit('container-disconnected');
            this.activeStreams.delete(socket.id);
            // Clean up handlers
            session.stream.removeListener('data', dataHandler);
            session.stream.removeListener('error', errorHandler);
            session.stream.removeListener('end', endHandler);
          };

          // Attach handlers
          session.stream.on('data', dataHandler);
          session.stream.on('error', errorHandler);
          session.stream.on('end', endHandler);
          
          // Store handlers for cleanup
          this.activeStreams.get(socket.id)!.handlers = {
            data: dataHandler,
            error: errorHandler,
            end: endHandler
          };

          // Confirm attachment
          socket.emit('attached', { containerId });
          
          // Send initial resize after a small delay to ensure exec is ready
          if (session.exec && data.cols && data.rows) {
            setTimeout(async () => {
              try {
                await session.exec.resize({ w: data.cols, h: data.rows });
              } catch (e) {
                // Ignore resize errors, exec might not support resize
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
        const streamInfo = this.activeStreams.get(socket.id);
        
        if (streamInfo?.exec) {
          try {
            await streamInfo.exec.resize({ w: cols, h: rows });
          } catch (error) {
            console.error(chalk.yellow('Failed to resize terminal:'), error);
          }
        }
      });

      socket.on('input', (data) => {
        const streamInfo = this.activeStreams.get(socket.id);
        if (streamInfo?.stream) {
          streamInfo.stream.write(data);
        }
      });

      socket.on('disconnect', () => {
        console.log(chalk.yellow('Client disconnected from web UI'));
        const streamInfo = this.activeStreams.get(socket.id);
        
        if (streamInfo) {
          // Clean up event handlers if they exist
          if (streamInfo.handlers && streamInfo.stream) {
            streamInfo.stream.removeListener('data', streamInfo.handlers.data);
            streamInfo.stream.removeListener('error', streamInfo.handlers.error);
            streamInfo.stream.removeListener('end', streamInfo.handlers.end);
          }
          
          // Don't end the stream - keep the session alive for reconnection
          // Only remove this socket's reference
          this.activeStreams.delete(socket.id);
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
    // Clean up all active streams
    for (const [, streamInfo] of this.activeStreams) {
      if (streamInfo.stream) {
        streamInfo.stream.end();
      }
    }
    this.activeStreams.clear();

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