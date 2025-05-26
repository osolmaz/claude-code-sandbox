import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { CommitInfo } from "./types";

export class UIManager {
  showCommitNotification(commit: CommitInfo): void {
    console.log("\n" + chalk.yellow("━".repeat(80)));
    console.log(chalk.yellow.bold("🔔 New Commit Detected!"));
    console.log(chalk.yellow("━".repeat(80)));
    console.log(chalk.white(`Hash: ${commit.hash.substring(0, 8)}`));
    console.log(chalk.white(`Author: ${commit.author}`));
    console.log(chalk.white(`Date: ${commit.date}`));
    console.log(chalk.white(`Message: ${commit.message}`));
    console.log(chalk.white(`Files changed: ${commit.files.length}`));
    commit.files.forEach((file) => {
      console.log(chalk.gray(`  - ${file}`));
    });
    console.log(chalk.yellow("━".repeat(80)) + "\n");
  }

  showDiff(diff: string): void {
    console.log(chalk.blue.bold("\n📝 Diff:"));
    console.log(chalk.blue("─".repeat(80)));

    // Apply syntax highlighting to diff
    const lines = diff.split("\n");
    lines.forEach((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        console.log(chalk.green(line));
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        console.log(chalk.red(line));
      } else if (line.startsWith("@@")) {
        console.log(chalk.cyan(line));
      } else if (line.startsWith("diff --git")) {
        console.log(chalk.yellow.bold(line));
      } else {
        console.log(line);
      }
    });

    console.log(chalk.blue("─".repeat(80)) + "\n");
  }

  async askCommitAction(): Promise<string> {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Continue working", value: "nothing" },
          { name: "Push branch to remote", value: "push" },
          { name: "Push branch and create PR", value: "push-pr" },
          { name: "Exit claude-code-sandbox", value: "exit" },
        ],
      },
    ]);

    return action;
  }

  showSpinner(message: string): any {
    return ora(message).start();
  }

  showSuccess(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  showError(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  showWarning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  showInfo(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }
}
