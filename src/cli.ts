#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { ClaudeSandbox } from "./index";
import { loadConfig } from "./config";

const program = new Command();

program
  .name("claude-sandbox")
  .description("Run Claude Code as an autonomous agent in Docker containers")
  .version("0.1.0")
  .option(
    "-c, --config <path>",
    "Path to configuration file",
    "./claude-sandbox.config.json",
  )
  .option(
    "-d, --detached",
    "Run in detached mode (container runs in background)",
    false,
  )
  .option("-n, --name <name>", "Container name prefix")
  .option(
    "--claude-config <path>",
    "Path to Claude configuration file (default: ~/.claude.json)",
  )
  .option("--no-push", "Disable automatic branch pushing")
  .option("--no-pr", "Disable automatic PR creation")
  .option("--no-auto-claude", "Disable automatic Claude Code startup", false)
  .action(async (options) => {
    try {
      console.log(chalk.blue("🚀 Starting Claude Sandbox..."));

      const config = await loadConfig(options.config);
      const sandbox = new ClaudeSandbox({
        ...config,
        detached: options.detached,
        containerPrefix: options.name,
        claudeConfigPath: options.claudeConfig || config.claudeConfigPath,
        autoPush: options.push,
        autoCreatePR: options.pr,
        autoStartClaude: !options.noAutoClaude,
      });

      await sandbox.run();
    } catch (error) {
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

program.parse();
