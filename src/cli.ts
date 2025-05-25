#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeSandbox } from './index';
import { loadConfig } from './config';
import path from 'path';

const program = new Command();

program
  .name('claude-sandbox')
  .description('Run Claude Code as an autonomous agent in Docker containers')
  .version('0.1.0')
  .option('-c, --config <path>', 'Path to configuration file', './claude-sandbox.config.json')
  .option('-d, --detached', 'Run in detached mode', false)
  .option('-n, --name <name>', 'Container name prefix')
  .option('--no-push', 'Disable automatic branch pushing')
  .option('--no-pr', 'Disable automatic PR creation')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Starting Claude Sandbox...'));
      
      const config = await loadConfig(options.config);
      const sandbox = new ClaudeSandbox({
        ...config,
        detached: options.detached,
        containerPrefix: options.name,
        autoPush: options.push,
        autoCreatePR: options.pr,
      });
      
      await sandbox.run();
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse();