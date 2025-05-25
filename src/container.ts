import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { Readable, Writable } from 'stream';
import { SandboxConfig, Credentials } from './types';

export class ContainerManager {
  private docker: Docker;
  private config: SandboxConfig;
  private containers: Map<string, Docker.Container> = new Map();

  constructor(docker: Docker, config: SandboxConfig) {
    this.docker = docker;
    this.config = config;
  }

  async start(containerConfig: any): Promise<string> {
    // Build or pull image
    await this.ensureImage();
    
    // Create container
    const container = await this.createContainer(containerConfig);
    this.containers.set(container.id, container);
    
    // Start container
    await container.start();
    
    return container.id;
  }

  private async ensureImage(): Promise<void> {
    const imageName = this.config.dockerImage || 'claude-sandbox:latest';
    
    // Check if we need to build from Dockerfile
    if (this.config.dockerfile) {
      await this.buildImage(this.config.dockerfile, imageName);
    } else {
      // Use default Dockerfile
      await this.buildDefaultImage(imageName);
    }
  }

  private async buildDefaultImage(imageName: string): Promise<void> {
    const dockerfile = `
FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    git \\
    openssh-client \\
    nodejs \\
    npm \\
    python3 \\
    python3-pip \\
    build-essential \\
    sudo \\
    vim \\
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \\
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \\
    && apt-get update \\
    && apt-get install -y gh

# Install Claude Code
RUN npm install -g claude-code@latest

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Create a wrapper script for git that prevents branch switching
RUN echo '#!/bin/bash\\n\\
if [[ "$1" == "checkout" ]] && [[ "$2" != "-b" ]]; then\\n\\
    echo "Branch switching is disabled in claude-sandbox"\\n\\
    exit 1\\n\\
fi\\n\\
/usr/bin/git "$@"' > /usr/local/bin/git && \\
    chmod +x /usr/local/bin/git

# Set up entrypoint
ENTRYPOINT ["/bin/bash", "-c"]
`;

    // Build image
    const buildStream = await this.docker.buildImage({
      context: undefined,
      src: ['Dockerfile'],
    }, {
      dockerfile: 'Dockerfile',
      t: imageName,
      buildargs: {
        'DOCKER_CONTENT': Buffer.from(dockerfile).toString('base64'),
      },
    });

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(buildStream, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  private async buildImage(dockerfilePath: string, imageName: string): Promise<void> {
    const dockerfile = await fs.readFile(dockerfilePath, 'utf-8');
    const buildContext = path.dirname(dockerfilePath);
    
    const buildStream = await this.docker.buildImage({
      context: buildContext,
      src: [path.basename(dockerfilePath)],
    }, {
      dockerfile: path.basename(dockerfilePath),
      t: imageName,
    });

    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(buildStream, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  private async createContainer(containerConfig: any): Promise<Docker.Container> {
    const { branchName, credentials, workDir, repoName } = containerConfig;
    
    // Prepare environment variables
    const env = this.prepareEnvironment(credentials);
    
    // Prepare volumes
    const volumes = this.prepareVolumes(workDir, credentials);
    
    // Create container
    const container = await this.docker.createContainer({
      Image: this.config.dockerImage || 'claude-sandbox:latest',
      name: `${this.config.containerPrefix || 'claude-sandbox'}-${Date.now()}`,
      Env: env,
      HostConfig: {
        Binds: volumes,
        AutoRemove: false,
        NetworkMode: 'bridge',
      },
      WorkingDir: '/workspace',
      Cmd: [`cd /workspace && git checkout ${branchName} && claude --dangerously-skip-permissions`],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
    });
    
    return container;
  }

  private prepareEnvironment(credentials: Credentials): string[] {
    const env = [];
    
    // Claude credentials
    if (credentials.claude) {
      switch (credentials.claude.type) {
        case 'api_key':
          env.push(`ANTHROPIC_API_KEY=${credentials.claude.value}`);
          break;
        case 'bedrock':
          env.push('CLAUDE_CODE_USE_BEDROCK=1');
          if (credentials.claude.region) {
            env.push(`AWS_REGION=${credentials.claude.region}`);
          }
          break;
        case 'vertex':
          env.push('CLAUDE_CODE_USE_VERTEX=1');
          if (credentials.claude.project) {
            env.push(`GOOGLE_CLOUD_PROJECT=${credentials.claude.project}`);
          }
          break;
      }
    }
    
    // GitHub token
    if (credentials.github?.token) {
      env.push(`GITHUB_TOKEN=${credentials.github.token}`);
    }
    
    // Additional config
    env.push('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1');
    if (this.config.maxThinkingTokens) {
      env.push(`MAX_THINKING_TOKENS=${this.config.maxThinkingTokens}`);
    }
    if (this.config.bashTimeout) {
      env.push(`BASH_MAX_TIMEOUT_MS=${this.config.bashTimeout}`);
    }
    
    // Add custom environment variables
    if (this.config.environment) {
      Object.entries(this.config.environment).forEach(([key, value]) => {
        env.push(`${key}=${value}`);
      });
    }
    
    return env;
  }

  private prepareVolumes(workDir: string, credentials: Credentials): string[] {
    const volumes = [
      `${workDir}:/workspace:rw`,
    ];
    
    // Mount SSH keys if available
    if (credentials.github?.sshKey) {
      volumes.push(`${process.env.HOME}/.ssh:/root/.ssh:ro`);
    }
    
    // Mount git config if available
    if (credentials.github?.gitConfig) {
      volumes.push(`${process.env.HOME}/.gitconfig:/root/.gitconfig:ro`);
    }
    
    // Add custom volumes
    if (this.config.volumes) {
      volumes.push(...this.config.volumes);
    }
    
    return volumes;
  }

  async attach(containerId: string): Promise<void> {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error('Container not found');
    }
    
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });
    
    // Handle terminal resize
    process.stdout.on('resize', () => {
      container.resize({
        w: process.stdout.columns,
        h: process.stdout.rows,
      });
    });
    
    // Set initial size
    container.resize({
      w: process.stdout.columns || 80,
      h: process.stdout.rows || 24,
    });
    
    // Connect streams
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.pipe(stream);
    
    container.modem.demuxStream(stream, process.stdout, process.stderr);
    
    // Handle exit
    stream.on('end', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    });
  }

  async cleanup(): Promise<void> {
    for (const [id, container] of this.containers) {
      try {
        await container.stop();
        await container.remove();
      } catch (error) {
        // Container might already be stopped
      }
    }
    this.containers.clear();
  }
}