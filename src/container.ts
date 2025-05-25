import Docker from 'dockerode';
import path from 'path';
import { SandboxConfig, Credentials } from './types';
import chalk from 'chalk';

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
    console.log(chalk.green('✓ Container started successfully'));
    
    // Copy working directory into container
    console.log(chalk.blue('Copying files into container...'));
    await this.copyWorkingDirectory(container, containerConfig.workDir);
    console.log(chalk.green('✓ Files copied successfully'));
    
    // Give the container a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return container.id;
  }

  private async ensureImage(): Promise<void> {
    const imageName = this.config.dockerImage || 'claude-code-sandbox:latest';
    
    // Check if image already exists
    try {
      await this.docker.getImage(imageName).inspect();
      console.log(chalk.green(`✓ Using existing image: ${imageName}`));
      return;
    } catch (error) {
      console.log(chalk.blue(`Building image: ${imageName}...`));
    }
    
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
    python3 \\
    python3-pip \\
    build-essential \\
    sudo \\
    vim \\
    ca-certificates \\
    gnupg \\
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\
    && apt-get install -y nodejs

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \\
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \\
    && apt-get update \\
    && apt-get install -y gh

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code@latest

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Create a wrapper script for git that prevents branch switching
RUN echo '#!/bin/bash\\n\\
# Allow the initial branch creation\\n\\
if [ ! -f /tmp/.branch-created ]; then\\n\\
    /usr/bin/git "$@"\\n\\
    if [[ "$1" == "checkout" ]] && [[ "$2" == "-b" ]]; then\\n\\
        touch /tmp/.branch-created\\n\\
    fi\\n\\
else\\n\\
    # After initial branch creation, prevent switching\\n\\
    if [[ "$1" == "checkout" ]] && [[ "$2" != "-b" ]]; then\\n\\
        echo "Branch switching is disabled in claude-code-sandbox"\\n\\
        exit 1\\n\\
    fi\\n\\
    if [[ "$1" == "switch" ]]; then\\n\\
        echo "Branch switching is disabled in claude-code-sandbox"\\n\\
        exit 1\\n\\
    fi\\n\\
    /usr/bin/git "$@"\\n\\
fi' > /usr/local/bin/git && \\
    chmod +x /usr/local/bin/git

# Set up entrypoint
ENTRYPOINT ["/bin/bash", "-c"]
`;

    // Build image from string
    const tarStream = require('tar-stream');
    const pack = tarStream.pack();
    
    // Add Dockerfile to tar
    pack.entry({ name: 'Dockerfile' }, dockerfile, (err: any) => {
      if (err) throw err;
      pack.finalize();
    });
    
    // Convert to buffer for docker
    const chunks: Buffer[] = [];
    pack.on('data', (chunk: any) => chunks.push(chunk));
    
    await new Promise((resolve) => {
      pack.on('end', resolve);
    });
    
    const tarBuffer = Buffer.concat(chunks);
    const buildStream = await this.docker.buildImage(tarBuffer as any, {
      t: imageName,
    });

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(buildStream as any, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      }, (event: any) => {
        if (event.stream) {
          process.stdout.write(event.stream);
        }
      });
    });
  }

  private async buildImage(dockerfilePath: string, imageName: string): Promise<void> {
    const buildContext = path.dirname(dockerfilePath);
    
    const buildStream = await this.docker.buildImage({
      context: buildContext,
      src: [path.basename(dockerfilePath)],
    }, {
      dockerfile: path.basename(dockerfilePath),
      t: imageName,
    });

    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(buildStream as any, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      }, (event: any) => {
        if (event.stream) {
          process.stdout.write(event.stream);
        }
      });
    });
  }

  private async createContainer(containerConfig: any): Promise<Docker.Container> {
    const { branchName, credentials, workDir } = containerConfig;
    
    // Prepare environment variables
    const env = this.prepareEnvironment(credentials);
    
    // Prepare volumes
    const volumes = this.prepareVolumes(workDir, credentials);
    
    // Create container
    const container = await this.docker.createContainer({
      Image: this.config.dockerImage || 'claude-code-sandbox:latest',
      name: `${this.config.containerPrefix || 'claude-code-sandbox'}-${Date.now()}`,
      Env: env,
      HostConfig: {
        Binds: volumes,
        AutoRemove: false,
        NetworkMode: 'bridge',
      },
      WorkingDir: '/workspace',
      Cmd: [`cd /workspace && git checkout -b ${branchName} && exec claude --dangerously-skip-permissions`],
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

  private prepareVolumes(_workDir: string, credentials: Credentials): string[] {
    // NO LONGER mounting the work directory - we'll copy files instead
    const volumes: string[] = [];
    
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
    
    console.log(chalk.blue('Attaching to container...'));
    
    // Check container status first
    const info = await container.inspect();
    console.log(chalk.blue(`Container state: Running=${info.State.Running}, Status=${info.State.Status}`));
    
    try {
      const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
      });
      
      // Set initial size
      await container.resize({
        w: process.stdout.columns || 80,
        h: process.stdout.rows || 24,
      }).catch(() => {}); // Ignore resize errors
      
      // Handle terminal resize
      process.stdout.on('resize', () => {
        container.resize({
          w: process.stdout.columns,
          h: process.stdout.rows,
        }).catch(() => {}); // Ignore resize errors
      });
      
      // Connect streams
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      
      // Use Docker's demux for proper stream handling
      container.modem.demuxStream(stream, process.stdout, process.stderr);
      
      // Connect stdin
      process.stdin.pipe(stream);
      
      // Handle exit
      stream.on('end', async () => {
        console.log(chalk.yellow('\nContainer stream ended'));
        
        // Get container logs to see what happened
        try {
          const logs = await container.logs({ stdout: true, stderr: true, tail: 50 });
          console.log(chalk.yellow('Container logs:'));
          console.log(logs.toString());
        } catch (e) {
          // Ignore
        }
        
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.exit(0);
      });
      
      stream.on('error', (err: Error) => {
        console.error(chalk.red('Stream error:'), err);
      });
      
    } catch (error) {
      console.error(chalk.red('Failed to attach to container:'), error);
      throw error;
    }
  }

  private async copyWorkingDirectory(container: Docker.Container, workDir: string): Promise<void> {
    const { execSync } = require('child_process');
    const fs = require('fs');
    
    try {
      // Get list of git-tracked files (including uncommitted changes)
      const trackedFiles = execSync('git ls-files', {
        cwd: workDir,
        encoding: 'utf-8'
      }).trim().split('\n').filter((f: string) => f);
      
      // Get list of untracked files that aren't ignored
      const untrackedFiles = execSync('git ls-files --others --exclude-standard', {
        cwd: workDir,
        encoding: 'utf-8'
      }).trim().split('\n').filter((f: string) => f);
      
      // Combine all files
      const allFiles = [...trackedFiles, ...untrackedFiles];
      
      console.log(chalk.blue(`Copying ${allFiles.length} files...`));
      
      // Create tar archive using git archive for tracked files + untracked files
      const tarFile = `/tmp/claude-sandbox-${Date.now()}.tar`;
      
      // First create archive of tracked files using git archive
      execSync(`git archive --format=tar -o "${tarFile}" HEAD`, {
        cwd: workDir,
        stdio: 'pipe'
      });
      
      // Add untracked files if any
      if (untrackedFiles.length > 0) {
        // Create a file list for tar
        const fileListPath = `/tmp/claude-sandbox-files-${Date.now()}.txt`;
        fs.writeFileSync(fileListPath, untrackedFiles.join('\n'));
        
        // Append untracked files to the tar
        execSync(`tar -rf "${tarFile}" --files-from="${fileListPath}"`, {
          cwd: workDir,
          stdio: 'pipe'
        });
        
        fs.unlinkSync(fileListPath);
      }
      
      // Read and copy the tar file in chunks to avoid memory issues
      const stream = fs.createReadStream(tarFile);
      
      // Copy to container
      await container.putArchive(stream, {
        path: '/workspace'
      });
      
      // Wait for stream to finish
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      
      // Clean up
      fs.unlinkSync(tarFile);
      
      // Also copy .git directory to preserve git history
      const gitTarFile = `/tmp/claude-sandbox-git-${Date.now()}.tar`;
      execSync(`tar -cf "${gitTarFile}" .git`, {
        cwd: workDir,
        stdio: 'pipe'
      });
      
      const gitStream = fs.createReadStream(gitTarFile);
      await container.putArchive(gitStream, {
        path: '/workspace'
      });
      
      await new Promise((resolve, reject) => {
        gitStream.on('end', resolve);
        gitStream.on('error', reject);
      });
      
      fs.unlinkSync(gitTarFile);
      
    } catch (error) {
      console.error(chalk.red('Failed to copy files:'), error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    for (const [, container] of this.containers) {
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