#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import Docker from "dockerode";
import { ClaudeSandbox } from "./index";
import { loadConfig } from "./config";
import { WebUIServer } from "./web-server";
import ora from "ora";

const docker = new Docker();
const program = new Command();

// Helper function to get Claude Sandbox containers
async function getClaudeSandboxContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.filter(c => 
    c.Names.some(name => name.includes('claude-code-sandbox'))
  );
}

// Helper function to select a container interactively
async function selectContainer(containers: any[]): Promise<string | null> {
  if (containers.length === 0) {
    console.log(chalk.yellow("No Claude Sandbox containers found."));
    return null;
  }

  const choices = containers.map(c => ({
    name: `${c.Names[0].substring(1)} - ${c.State} (${c.Status})`,
    value: c.Id,
    short: c.Id.substring(0, 12)
  }));

  const { containerId } = await inquirer.prompt([{
    type: 'list',
    name: 'containerId',
    message: 'Select a container:',
    choices
  }]);

  return containerId;
}

program
  .name("claude-sandbox")
  .description("Run Claude Code in isolated Docker containers")
  .version("0.1.0");

// Default command (start with web UI)
program
  .action(async () => {
    console.log(chalk.blue("🚀 Starting Claude Sandbox..."));
    
    const config = await loadConfig("./claude-sandbox.config.json");
    config.webUI = true; // Always use web UI by default
    config.detached = true; // Web UI requires detached mode
    config.includeUntracked = false; // Don't include untracked files by default
    
    const sandbox = new ClaudeSandbox(config);
    await sandbox.run();
  });

// Start command - explicitly start a new container
program
  .command("start")
  .description("Start a new Claude Sandbox container")
  .option("-c, --config <path>", "Configuration file", "./claude-sandbox.config.json")
  .option("-n, --name <name>", "Container name prefix")
  .option("--no-web", "Disable web UI (use terminal attach)")
  .option("--no-push", "Disable automatic branch pushing")
  .option("--no-pr", "Disable automatic PR creation")
  .option("--include-untracked", "Include untracked files when copying to container")
  .option("-b, --branch <branch>", "Switch to specific branch on container start (creates if doesn't exist)")
  .action(async (options) => {
    console.log(chalk.blue("🚀 Starting new Claude Sandbox container..."));
    
    const config = await loadConfig(options.config);
    config.webUI = options.web !== false;
    config.detached = config.webUI; // Web UI requires detached
    config.containerPrefix = options.name || config.containerPrefix;
    config.autoPush = options.push !== false;
    config.autoCreatePR = options.pr !== false;
    config.includeUntracked = options.includeUntracked || false;
    config.targetBranch = options.branch;
    
    const sandbox = new ClaudeSandbox(config);
    await sandbox.run();
  });

// Attach command - attach to existing container
program
  .command("attach [container-id]")
  .description("Attach to an existing Claude Sandbox container")
  .option("--no-web", "Use terminal attach instead of web UI")
  .action(async (containerId, options) => {
    const spinner = ora("Looking for containers...").start();
    
    try {
      let targetContainerId = containerId;
      
      // If no container ID provided, show selection UI
      if (!targetContainerId) {
        spinner.stop();
        const containers = await getClaudeSandboxContainers();
        targetContainerId = await selectContainer(containers);
        
        if (!targetContainerId) {
          console.log(chalk.red("No container selected."));
          process.exit(1);
        }
      }
      
      spinner.text = "Attaching to container...";
      
      if (options.web !== false) {
        // Launch web UI for existing container
        const webServer = new WebUIServer(docker);
        const url = await webServer.start();
        const fullUrl = `${url}?container=${targetContainerId}`;
        
        spinner.succeed(chalk.green(`Web UI available at: ${fullUrl}`));
        await webServer.openInBrowser(fullUrl);
        
        console.log(chalk.yellow("Keep this terminal open to maintain the session"));
        
        // Keep process running
        await new Promise(() => {});
      } else {
        // Direct terminal attach
        spinner.stop();
        console.log(chalk.blue(`Attaching to container ${targetContainerId.substring(0, 12)}...`));
        
        const container = docker.getContainer(targetContainerId);
        const stream = await container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true
        });
        
        // Set up TTY
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        
        // Connect streams
        stream.pipe(process.stdout);
        process.stdin.pipe(stream);
        
        // Handle cleanup
        const cleanup = () => {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdin.pause();
          stream.end();
        };
        
        process.on('SIGINT', cleanup);
        stream.on('end', cleanup);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Failed: ${error.message}`));
      process.exit(1);
    }
  });

// List command - list all Claude Sandbox containers
program
  .command("list")
  .alias("ls")
  .description("List all Claude Sandbox containers")
  .option("-a, --all", "Show all containers (including stopped)")
  .action(async (options) => {
    const spinner = ora("Fetching containers...").start();
    
    try {
      const containers = await docker.listContainers({ all: options.all });
      const claudeContainers = containers.filter(c => 
        c.Names.some(name => name.includes('claude-code-sandbox'))
      );
      
      spinner.stop();
      
      if (claudeContainers.length === 0) {
        console.log(chalk.yellow("No Claude Sandbox containers found."));
        return;
      }
      
      console.log(chalk.blue(`Found ${claudeContainers.length} Claude Sandbox container(s):\n`));
      
      claudeContainers.forEach(c => {
        const name = c.Names[0].substring(1);
        const id = c.Id.substring(0, 12);
        const state = c.State === 'running' ? chalk.green(c.State) : chalk.gray(c.State);
        const status = c.Status;
        
        console.log(`${chalk.cyan(id)} - ${name} - ${state} - ${status}`);
      });
    } catch (error: any) {
      spinner.fail(chalk.red(`Failed: ${error.message}`));
      process.exit(1);
    }
  });

// Stop command - stop Claude Sandbox containers
program
  .command("stop [container-id]")
  .description("Stop Claude Sandbox container(s)")
  .option("-a, --all", "Stop all Claude Sandbox containers")
  .action(async (containerId, options) => {
    const spinner = ora("Stopping containers...").start();
    
    try {
      if (options.all) {
        // Stop all Claude Sandbox containers
        const containers = await getClaudeSandboxContainers();
        const runningContainers = containers.filter(c => c.State === 'running');
        
        if (runningContainers.length === 0) {
          spinner.info("No running Claude Sandbox containers found.");
          return;
        }
        
        for (const c of runningContainers) {
          const container = docker.getContainer(c.Id);
          await container.stop();
          spinner.text = `Stopped ${c.Id.substring(0, 12)}`;
        }
        
        spinner.succeed(`Stopped ${runningContainers.length} container(s)`);
      } else {
        // Stop specific container
        let targetContainerId = containerId;
        
        if (!targetContainerId) {
          spinner.stop();
          const containers = await getClaudeSandboxContainers();
          const runningContainers = containers.filter(c => c.State === 'running');
          targetContainerId = await selectContainer(runningContainers);
          
          if (!targetContainerId) {
            console.log(chalk.red("No container selected."));
            process.exit(1);
          }
          spinner.start();
        }
        
        const container = docker.getContainer(targetContainerId);
        await container.stop();
        spinner.succeed(`Stopped container ${targetContainerId.substring(0, 12)}`);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Failed: ${error.message}`));
      process.exit(1);
    }
  });

// Logs command - view container logs
program
  .command("logs [container-id]")
  .description("View logs from a Claude Sandbox container")
  .option("-f, --follow", "Follow log output")
  .option("-n, --tail <lines>", "Number of lines to show from the end", "50")
  .action(async (containerId, options) => {
    try {
      let targetContainerId = containerId;
      
      if (!targetContainerId) {
        const containers = await getClaudeSandboxContainers();
        targetContainerId = await selectContainer(containers);
        
        if (!targetContainerId) {
          console.log(chalk.red("No container selected."));
          process.exit(1);
        }
      }
      
      const container = docker.getContainer(targetContainerId);
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: options.follow,
        tail: parseInt(options.tail)
      });
      
      // Docker logs come with headers, we need to parse them
      container.modem.demuxStream(logStream, process.stdout, process.stderr);
      
      if (options.follow) {
        console.log(chalk.gray("Following logs... Press Ctrl+C to exit"));
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed: ${error.message}`));
      process.exit(1);
    }
  });

// Clean command - remove stopped containers
program
  .command("clean")
  .description("Remove all stopped Claude Sandbox containers")
  .option("-f, --force", "Remove all containers (including running)")
  .action(async (options) => {
    const spinner = ora("Cleaning up containers...").start();
    
    try {
      const containers = await getClaudeSandboxContainers();
      const targetContainers = options.force 
        ? containers 
        : containers.filter(c => c.State !== 'running');
      
      if (targetContainers.length === 0) {
        spinner.info("No containers to clean up.");
        return;
      }
      
      for (const c of targetContainers) {
        const container = docker.getContainer(c.Id);
        if (c.State === 'running' && options.force) {
          await container.stop();
        }
        await container.remove();
        spinner.text = `Removed ${c.Id.substring(0, 12)}`;
      }
      
      spinner.succeed(`Cleaned up ${targetContainers.length} container(s)`);
    } catch (error: any) {
      spinner.fail(chalk.red(`Failed: ${error.message}`));
      process.exit(1);
    }
  });

// Purge command - stop and remove all containers
program
  .command("purge")
  .description("Stop and remove all Claude Sandbox containers")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      const containers = await getClaudeSandboxContainers();
      
      if (containers.length === 0) {
        console.log(chalk.yellow("No Claude Sandbox containers found."));
        return;
      }
      
      // Show what will be removed
      console.log(chalk.yellow(`Found ${containers.length} Claude Sandbox container(s):`));
      containers.forEach(c => {
        console.log(`  ${c.Id.substring(0, 12)} - ${c.Names[0].replace('/', '')} - ${c.State}`);
      });
      
      // Confirm unless -y flag is used
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to stop and remove all containers?',
          default: false
        }]);
        
        if (!confirm) {
          console.log(chalk.gray("Purge cancelled."));
          return;
        }
      }
      
      const spinner = ora("Purging containers...").start();
      let removed = 0;
      
      for (const c of containers) {
        try {
          const container = docker.getContainer(c.Id);
          spinner.text = `Stopping ${c.Id.substring(0, 12)}...`;
          
          if (c.State === 'running') {
            await container.stop({ t: 5 }); // 5 second timeout
          }
          
          spinner.text = `Removing ${c.Id.substring(0, 12)}...`;
          await container.remove();
          removed++;
        } catch (error: any) {
          spinner.warn(`Failed to remove ${c.Id.substring(0, 12)}: ${error.message}`);
        }
      }
      
      if (removed === containers.length) {
        spinner.succeed(chalk.green(`✓ Purged all ${removed} container(s)`));
      } else {
        spinner.warn(chalk.yellow(`Purged ${removed} of ${containers.length} container(s)`));
      }
    } catch (error: any) {
      console.error(chalk.red(`Purge failed: ${error.message}`));
      process.exit(1);
    }
  });

// Config command - show configuration
program
  .command("config")
  .description("Show current configuration")
  .option("-p, --path <path>", "Configuration file path", "./claude-sandbox.config.json")
  .action(async (options) => {
    try {
      const config = await loadConfig(options.path);
      console.log(chalk.blue("Current configuration:"));
      console.log(JSON.stringify(config, null, 2));
    } catch (error: any) {
      console.error(chalk.red(`Failed to load config: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();