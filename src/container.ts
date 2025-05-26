import Docker from "dockerode";
import path from "path";
import { SandboxConfig, Credentials } from "./types";
import chalk from "chalk";

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
    console.log(chalk.green("✓ Container started successfully"));

    // Copy working directory into container
    console.log(chalk.blue("Copying files into container..."));
    try {
      await this._copyWorkingDirectory(container, containerConfig.workDir);
      console.log(chalk.green("✓ Files copied successfully"));

      // Copy Claude configuration if it exists
      await this._copyClaudeConfig(container);
    } catch (error) {
      console.error(chalk.red("File copy failed:"), error);
      // Clean up container on failure
      await container.stop().catch(() => {});
      await container.remove().catch(() => {});
      this.containers.delete(container.id);
      throw error;
    }

    // Give the container a moment to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(
      chalk.green(
        "Container initialization complete, returning container ID..."
      )
    );

    return container.id;
  }

  private async ensureImage(): Promise<void> {
    const imageName = this.config.dockerImage || "claude-code-sandbox:latest";

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

# Create a non-root user with sudo privileges
RUN useradd -m -s /bin/bash claude && \\
    echo 'claude ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers && \\
    usermod -aG sudo claude

# Create workspace directory and set ownership
RUN mkdir -p /workspace && \\
    chown -R claude:claude /workspace

# Switch to non-root user
USER claude
WORKDIR /workspace

# Create a wrapper script for git that prevents branch switching
RUN sudo mv /usr/bin/git /usr/bin/git.real && \
    echo -e '#!/bin/bash\\nif [ ! -f /tmp/.branch-created ]; then\\n    /usr/bin/git.real "$@"\\n    if [[ "$1" == "checkout" ]] && [[ "$2" == "-b" ]]; then\\n        touch /tmp/.branch-created\\n    fi\\nelse\\n    if [[ "$1" == "checkout" ]] && [[ "$2" != "-b" ]]; then\\n        echo "Branch switching is disabled in claude-code-sandbox"\\n        exit 1\\n    fi\\n    if [[ "$1" == "switch" ]]; then\\n        echo "Branch switching is disabled in claude-code-sandbox"\\n        exit 1\\n    fi\\n    /usr/bin/git.real "$@"\\nfi' | sudo tee /usr/bin/git > /dev/null && \
    sudo chmod +x /usr/bin/git

# Set up entrypoint
ENTRYPOINT ["/bin/bash", "-c"]
`;
    /*
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
# Create startup script
RUN echo '#!/bin/bash\\n\\
echo "Waiting for attachment..."\\n\\
sleep 2\\n\\
cd /workspace\\n\\
git checkout -b "$1"\\n\\
echo "Starting Claude Code on branch $1..."\\n\\
exec claude --dangerously-skip-permissions' > /start-claude.sh && \\
    chmod +x /start-claude.sh */
    // Build image from string
    const tarStream = require("tar-stream");
    const pack = tarStream.pack();

    // Add Dockerfile to tar
    pack.entry({ name: "Dockerfile" }, dockerfile, (err: any) => {
      if (err) throw err;
      pack.finalize();
    });

    // Convert to buffer for docker
    const chunks: Buffer[] = [];
    pack.on("data", (chunk: any) => chunks.push(chunk));

    await new Promise((resolve) => {
      pack.on("end", resolve);
    });

    const tarBuffer = Buffer.concat(chunks);
    const buildStream = await this.docker.buildImage(tarBuffer as any, {
      t: imageName,
    });

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        buildStream as any,
        (err: any, res: any) => {
          if (err) reject(err);
          else resolve(res);
        },
        (event: any) => {
          if (event.stream) {
            process.stdout.write(event.stream);
          }
        }
      );
    });
  }

  private async buildImage(
    dockerfilePath: string,
    imageName: string
  ): Promise<void> {
    const buildContext = path.dirname(dockerfilePath);

    const buildStream = await this.docker.buildImage(
      {
        context: buildContext,
        src: [path.basename(dockerfilePath)],
      },
      {
        dockerfile: path.basename(dockerfilePath),
        t: imageName,
      }
    );

    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        buildStream as any,
        (err: any, res: any) => {
          if (err) reject(err);
          else resolve(res);
        },
        (event: any) => {
          if (event.stream) {
            process.stdout.write(event.stream);
          }
        }
      );
    });
  }

  private async createContainer(
    containerConfig: any
  ): Promise<Docker.Container> {
    const { credentials, workDir } = containerConfig;

    // Prepare environment variables
    const env = this.prepareEnvironment(credentials);

    // Prepare volumes
    const volumes = this.prepareVolumes(workDir, credentials);

    // Create container
    const container = await this.docker.createContainer({
      Image: this.config.dockerImage || "claude-code-sandbox:latest",
      name: `${
        this.config.containerPrefix || "claude-code-sandbox"
      }-${Date.now()}`,
      Env: env,
      HostConfig: {
        Binds: volumes,
        AutoRemove: false,
        NetworkMode: "bridge",
      },
      WorkingDir: "/workspace",
      Cmd: ["/bin/bash", "-l"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
    });

    return container;
  }

  private prepareEnvironment(credentials: Credentials): string[] {
    const env = [];

    // Claude credentials from discovery
    if (credentials.claude) {
      switch (credentials.claude.type) {
        case "api_key":
          env.push(`ANTHROPIC_API_KEY=${credentials.claude.value}`);
          break;
        case "bedrock":
          env.push("CLAUDE_CODE_USE_BEDROCK=1");
          if (credentials.claude.region) {
            env.push(`AWS_REGION=${credentials.claude.region}`);
          }
          break;
        case "vertex":
          env.push("CLAUDE_CODE_USE_VERTEX=1");
          if (credentials.claude.project) {
            env.push(`GOOGLE_CLOUD_PROJECT=${credentials.claude.project}`);
          }
          break;
      }
    } else if (process.env.ANTHROPIC_API_KEY) {
      // If no Claude credentials were discovered but ANTHROPIC_API_KEY is in environment, pass it through
      env.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
    }

    // GitHub token
    if (credentials.github?.token) {
      env.push(`GITHUB_TOKEN=${credentials.github.token}`);
    }

    // Additional config
    env.push("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1");
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
    // NO MOUNTING - we'll copy files instead
    const volumes: string[] = [];

    // Mount SSH keys if available
    if (credentials.github?.sshKey) {
      volumes.push(`${process.env.HOME}/.ssh:/home/claude/.ssh:ro`);
    }

    // Mount git config if available
    if (credentials.github?.gitConfig) {
      volumes.push(`${process.env.HOME}/.gitconfig:/home/claude/.gitconfig:ro`);
    }

    // Add custom volumes
    if (this.config.volumes) {
      volumes.push(...this.config.volumes);
    }

    return volumes;
  }

  async attach(containerId: string, branchName?: string): Promise<void> {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error("Container not found");
    }

    console.log(chalk.blue("Connecting to container..."));

    // Use provided branch name or generate one
    const targetBranch =
      branchName ||
      `claude/${
        new Date().toISOString().replace(/[:.]/g, "-").split("T")[0]
      }-${Date.now()}`;

    // First, set up the git branch and create startup script
    try {
      console.log(chalk.green("Setting up git branch and startup script..."));

      // Create different startup scripts based on autoStartClaude setting
      const startupScript = this.config.autoStartClaude
        ? `#!/bin/bash
echo "🚀 Starting Claude Code automatically..."
echo "Press Ctrl+C to interrupt and access shell"
echo ""
claude --dangerously-skip-permissions
echo ""
echo "Claude exited. You now have access to the shell."
echo "Type \"claude --dangerously-skip-permissions\" to restart Claude"
echo "Type \"exit\" to end the session"
exec /bin/bash`
        : `#!/bin/bash
echo "Welcome to Claude Code Sandbox!"
echo "Type \"claude --dangerously-skip-permissions\" to start Claude Code"
echo "Type \"exit\" to end the session"
exec /bin/bash`;

      const setupExec = await container.exec({
        Cmd: [
          "/bin/bash",
          "-c",
          `
          cd /workspace &&
          sudo chown -R claude:claude /workspace &&
          git config --global --add safe.directory /workspace &&
          git checkout -b "${targetBranch}" &&
          echo "✓ Created branch: ${targetBranch}" &&
          echo '${startupScript}' > /home/claude/start-session.sh &&
          chmod +x /home/claude/start-session.sh &&
          echo "✓ Startup script created"
        `,
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      const setupStream = await setupExec.start({});

      // Wait for setup to complete
      await new Promise<void>((resolve, reject) => {
        let output = "";
        setupStream.on("data", (chunk) => {
          output += chunk.toString();
          process.stdout.write(chunk);
        });
        setupStream.on("end", () => {
          if (
            output.includes("✓ Created branch") &&
            output.includes("✓ Startup script created")
          ) {
            resolve();
          } else {
            reject(new Error("Setup failed"));
          }
        });
        setupStream.on("error", reject);
      });

      console.log(chalk.green("✓ Container setup completed"));
    } catch (error) {
      console.error(chalk.red("Setup failed:"), error);
      throw error;
    }

    // Now create an interactive session that runs our startup script
    console.log(chalk.blue("Starting interactive session..."));
    if (this.config.autoStartClaude) {
      console.log(chalk.yellow("Claude Code will start automatically"));
      console.log(
        chalk.yellow("Press Ctrl+C to interrupt Claude and access the shell")
      );
    } else {
      console.log(
        chalk.yellow(
          'Type "claude --dangerously-skip-permissions" to start Claude Code'
        )
      );
    }
    console.log(chalk.yellow('Press Ctrl+D or type "exit" to end the session'));

    const exec = await container.exec({
      Cmd: ["/home/claude/start-session.sh"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: "/workspace",
    });

    // Start the exec with hijack mode for proper TTY
    const stream = await exec.start({
      hijack: true,
      stdin: true,
    });

    // Set up TTY properly
    const originalRawMode = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Resize handler
    const resize = async () => {
      try {
        await exec.resize({
          w: process.stdout.columns || 80,
          h: process.stdout.rows || 24,
        });
      } catch (e) {
        // Ignore resize errors
      }
    };

    // Initial resize
    await resize();
    process.stdout.on("resize", resize);

    // Connect streams bidirectionally
    stream.pipe(process.stdout);
    process.stdin.pipe(stream);

    // Set up proper cleanup
    const cleanup = () => {
      console.log(chalk.yellow("\nCleaning up session..."));
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(originalRawMode);
      }
      process.stdin.pause();
      process.stdout.removeListener("resize", resize);
      if (stream && typeof stream.end === "function") {
        stream.end();
      }
    };

    // Return a promise that resolves when the session ends
    return new Promise<void>((resolve, reject) => {
      let sessionEnded = false;

      const handleEnd = () => {
        if (!sessionEnded) {
          sessionEnded = true;
          console.log(chalk.yellow("\nContainer session ended"));
          cleanup();
          resolve();
        }
      };

      const handleError = (err: Error) => {
        if (!sessionEnded) {
          sessionEnded = true;
          console.error(chalk.red("Stream error:"), err);
          cleanup();
          reject(err);
        }
      };

      stream.on("end", handleEnd);
      stream.on("close", handleEnd);
      stream.on("error", handleError);

      // Also monitor the exec process
      const checkExec = async () => {
        try {
          const info = await exec.inspect();
          if (info.ExitCode !== null && !sessionEnded) {
            handleEnd();
          }
        } catch (e) {
          // Exec might be gone
          if (!sessionEnded) {
            handleEnd();
          }
        }
      };

      // Check exec status periodically
      const statusInterval = setInterval(checkExec, 1000);

      // Clean up interval when session ends
      stream.on("end", () => clearInterval(statusInterval));
      stream.on("close", () => clearInterval(statusInterval));
    });
  }

  private async _copyWorkingDirectory(
    container: Docker.Container,
    workDir: string
  ): Promise<void> {
    const { execSync } = require("child_process");
    const fs = require("fs");

    try {
      // Get list of git-tracked files (including uncommitted changes)
      const trackedFiles = execSync("git ls-files", {
        cwd: workDir,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter((f: string) => f);

      // Get list of untracked files that aren't ignored
      const untrackedFiles = execSync(
        "git ls-files --others --exclude-standard",
        {
          cwd: workDir,
          encoding: "utf-8",
        }
      )
        .trim()
        .split("\n")
        .filter((f: string) => f);

      // Combine all files
      const allFiles = [...trackedFiles, ...untrackedFiles];

      console.log(chalk.blue(`Copying ${allFiles.length} files...`));

      // Create tar archive using git archive for tracked files + untracked files
      const tarFile = `/tmp/claude-sandbox-${Date.now()}.tar`;

      console.log(chalk.green("Creating archive of tracked files..."));
      // First create archive of tracked files using git archive
      execSync(`git archive --format=tar -o "${tarFile}" HEAD`, {
        cwd: workDir,
        stdio: "pipe",
      });

      // Add untracked files if any
      if (untrackedFiles.length > 0) {
        // Create a file list for tar
        const fileListPath = `/tmp/claude-sandbox-files-${Date.now()}.txt`;
        fs.writeFileSync(fileListPath, untrackedFiles.join("\n"));

        // Append untracked files to the tar
        execSync(`tar -rf "${tarFile}" --files-from="${fileListPath}"`, {
          cwd: workDir,
          stdio: "pipe",
        });

        fs.unlinkSync(fileListPath);
      }

      // Read and copy the tar file in chunks to avoid memory issues
      const stream = fs.createReadStream(tarFile);

      console.log(chalk.green("Uploading files to container..."));

      // Add timeout for putArchive
      const uploadPromise = container.putArchive(stream, {
        path: "/workspace",
      });

      // Wait for both upload and stream to complete
      await Promise.all([
        uploadPromise,
        new Promise<void>((resolve, reject) => {
          stream.on("end", () => {
            console.log(chalk.green("Stream ended"));
            resolve();
          });
          stream.on("error", reject);
        }),
      ]);

      console.log(chalk.green("Upload completed"));

      // Clean up
      fs.unlinkSync(tarFile);

      // Also copy .git directory to preserve git history
      console.log(chalk.green("Copying git history..."));
      const gitTarFile = `/tmp/claude-sandbox-git-${Date.now()}.tar`;
      execSync(`tar -cf "${gitTarFile}" .git`, {
        cwd: workDir,
        stdio: "pipe",
      });

      try {
        const gitStream = fs.createReadStream(gitTarFile);

        // Upload git archive
        await container.putArchive(gitStream, {
          path: "/workspace",
        });

        console.log(chalk.green("Git history upload completed"));

        // Clean up
        fs.unlinkSync(gitTarFile);
        console.log(chalk.green("File copy completed"));
      } catch (error) {
        console.error(chalk.red("Git history copy failed:"), error);
        // Clean up the tar file even if upload failed
        try {
          fs.unlinkSync(gitTarFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        throw error;
      }
    } catch (error) {
      console.error(chalk.red("Failed to copy files:"), error);
      throw error;
    }
  }

  private async _copyClaudeConfig(container: Docker.Container): Promise<void> {
    const fs = require("fs");

    if (!this.config.claudeConfigPath) {
      return;
    }

    try {
      // Check if the Claude config file exists
      if (!fs.existsSync(this.config.claudeConfigPath)) {
        console.log(
          chalk.yellow(
            `Claude config not found at ${this.config.claudeConfigPath}, skipping...`
          )
        );
        return;
      }

      console.log(chalk.blue("Copying Claude configuration..."));

      // Read the Claude config file
      const configContent = fs.readFileSync(
        this.config.claudeConfigPath,
        "utf-8"
      );

      // Create a temporary tar file with the Claude config
      const tarFile = `/tmp/claude-config-${Date.now()}.tar`;
      const tarStream = require("tar-stream");
      const pack = tarStream.pack();

      // Add the .claude.json file to the tar
      pack.entry(
        { name: ".claude.json", mode: 0o600 },
        configContent,
        (err: any) => {
          if (err) throw err;
          pack.finalize();
        }
      );

      // Write the tar to a file
      const chunks: Buffer[] = [];
      pack.on("data", (chunk: any) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        pack.on("end", () => {
          fs.writeFileSync(tarFile, Buffer.concat(chunks));
          resolve();
        });
        pack.on("error", reject);
      });

      // Copy the tar file to the container's claude user home directory
      const stream = fs.createReadStream(tarFile);
      await container.putArchive(stream, {
        path: "/home/claude", // Copy to claude user's home directory
      });

      // Clean up
      fs.unlinkSync(tarFile);

      // Fix permissions on the copied file
      const fixPermsExec = await container.exec({
        Cmd: [
          "/bin/bash",
          "-c",
          "sudo chown claude:claude /home/claude/.claude.json && chmod 600 /home/claude/.claude.json",
        ],
        AttachStdout: false,
        AttachStderr: false,
      });

      await fixPermsExec.start({});

      console.log(chalk.green("✓ Claude configuration copied successfully"));
    } catch (error) {
      console.error(
        chalk.yellow("Warning: Failed to copy Claude configuration:"),
        error
      );
      // Don't throw - this is not critical for container operation
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
