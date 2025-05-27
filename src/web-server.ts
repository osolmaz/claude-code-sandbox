import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import Docker from 'dockerode';
import chalk from 'chalk';

export class WebUIServer {
  private app: express.Application;
  private httpServer: any;
  private io: Server;
  private docker: Docker;
  private activeStreams: Map<string, any> = new Map();
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
          
          // Create exec instance for interactive terminal
          const exec = await container.exec({
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            Cmd: ['/bin/bash', '-l'],
            WorkingDir: '/workspace'
          });

          const stream = await exec.start({
            hijack: true,
            stdin: true
          });

          // Store stream reference
          this.activeStreams.set(socket.id, { stream, exec });

          // Handle output from container
          stream.on('data', (chunk: Buffer) => {
            socket.emit('output', chunk.toString('utf8'));
          });

          stream.on('error', (err: Error) => {
            console.error(chalk.red('Stream error:'), err);
            socket.emit('error', { message: err.message });
          });

          stream.on('end', () => {
            socket.emit('disconnect');
            this.activeStreams.delete(socket.id);
          });

          // Confirm attachment
          socket.emit('attached', { containerId });

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
        if (streamInfo?.stream) {
          streamInfo.stream.end();
        }
        this.activeStreams.delete(socket.id);
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