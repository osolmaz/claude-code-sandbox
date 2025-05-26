---
title: "GitHub Actions"
source: "https://docs.anthropic.com/en/docs/claude-code/github-actions"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-26
description: "Integrate Claude Code with your GitHub workflows for automated code review, PR management, and issue triage."
tags:
  - "clippings"
---

Claude Code GitHub Actions brings AI-powered automation to your GitHub workflow. With a simple `@claude` mention in any PR or issue, Claude can analyze your code, create pull requests, implement features, and fix bugs - all while following your project’s standards.

Claude Code GitHub Actions is currently in beta. Features and functionality may evolve as we refine the experience.

Claude Code GitHub Actions is built on top of the [Claude Code SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), which enables programmatic integration of Claude Code into your applications. You can use the SDK to build custom automation workflows beyond GitHub Actions.

## Why use Claude Code GitHub Actions?

- **Instant PR creation**: Describe what you need, and Claude creates a complete PR with all necessary changes
- **Automated code implementation**: Turn issues into working code with a single command
- **Follows your standards**: Claude respects your `CLAUDE.md` guidelines and existing code patterns
- **Simple setup**: Get started in minutes with our installer and API key
- **Secure by default**: Your code stays on Github’s runners

## What can Claude do?

Claude Code provides powerful GitHub Actions that transform how you work with code:

### Claude Code Action

This GitHub Action allows you to run Claude Code within your GitHub Actions workflows. You can use this to build any custom workflow on top of Claude Code.

[View repository →](https://github.com/anthropics/claude-code-action)

### Claude Code Action (Base)

The foundation for building custom GitHub workflows with Claude. This extensible framework gives you full access to Claude’s capabilities for creating tailored automation.

[View repository →](https://github.com/anthropics/claude-code-base-action)

## Quick start

The easiest way to set up this action is through Claude Code in the terminal. Just open claude and run `/install-github-app`.

This command will guide you through setting up the GitHub app and required secrets.

- You must be a repository admin to install the GitHub app and add secrets
- This quickstart method is only available for direct Anthropic API users. If you’re using AWS Bedrock or Google Vertex AI, please see the [Using with AWS Bedrock & Google Vertex AI](https://docs.anthropic.com/en/docs/claude-code/github-actions#using-with-aws-bedrock-%26-google-vertex-ai) section.

### If the setup script fails

If the `/install-github-app` command fails or you prefer manual setup, please follow these manual setup instructions:

1. **Install the Claude GitHub app** to your repository: [https://github.com/apps/claude](https://github.com/apps/claude)
2. **Add ANTHROPIC_API_KEY** to your repository secrets ([Learn how to use secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions))
3. **Copy the workflow file** from [examples/claude.yml](https://github.com/anthropics/claude-code-action/blob/main/examples/claude.yml) into your repository’s `.github/workflows/`

## Example use cases

Claude Code GitHub Actions can help you with a variety of tasks, including:

### Turn issues into PRs

Claude will analyze the issue, write the code, and create a PR for review.

### Get implementation help

Claude will analyze your code and provide specific implementation guidance.

### Fix bugs quickly

Claude will locate the bug, implement a fix, and create a PR.

## Best practices

### CLAUDE.md configuration

Create a `CLAUDE.md` file in your repository root to define code style guidelines, review criteria, project-specific rules, and preferred patterns. This file guides Claude’s understanding of your project standards.

### Security considerations

**⚠️ IMPORTANT: Never commit API keys directly to your repository!**

Always use GitHub Secrets for API keys:

- Add your API key as a repository secret named `ANTHROPIC_API_KEY`
- Reference it in workflows: `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`
- Limit action permissions to only what’s necessary
- Review Claude’s suggestions before merging

**Use explicit tools for better security:**

When configuring `allowed_tools`, avoid wildcard patterns and instead explicitly list the specific commands Claude can use:

This approach ensures Claude can only execute the specific commands you’ve authorized, reducing potential security risks.

### Optimizing performance

Use issue templates to provide context, keep your `CLAUDE.md` concise and focused, and configure appropriate timeouts for your workflows.

### CI costs

When using Claude Code GitHub Actions, be aware of the associated costs:

**GitHub Actions costs:**

- Claude Code runs on GitHub-hosted runners, which consume your GitHub Actions minutes
- See [GitHub’s billing documentation](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) for detailed pricing and minute limits

**API costs:**

- Each Claude interaction consumes API tokens based on the length of prompts and responses
- Token usage varies by task complexity and codebase size
- See [Claude’s pricing page](https://www.anthropic.com/api) for current token rates

**Cost optimization tips:**

- Use specific `@claude` commands to reduce unnecessary API calls
- Configure appropriate `max_turns` limits to prevent excessive iterations
- Set reasonable `timeout_minutes` to avoid runaway workflows
- Consider using GitHub’s concurrency controls to limit parallel runs

## Configuration examples

This section provides ready-to-use workflow configurations for different use cases:

- [Basic workflow setup](https://docs.anthropic.com/en/docs/claude-code/github-actions#basic-workflow-setup) - The default configuration for issue and PR comments
- [Code review on pull requests](https://docs.anthropic.com/en/docs/claude-code/github-actions#code-review-on-pull-requests) - Automated code reviews on new PRs

### Basic workflow setup

This is the default workflow created by the installer. It enables Claude to respond to `@claude` mentions in issues and PR comments:

```yaml
name: Claude PR Creation
on:
  issue_comment:
    types: [created] # Triggers when someone comments on an issue or PR

jobs:
  create-pr:
    # Only run if the comment mentions @claude
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@beta
        with:
          # Pass the comment text as the prompt
          prompt: "${{ github.event.comment.body }}"

          # Define which tools Claude can use
          allowed_tools: [
              # Git inspection commands (read-only)
              "Bash(git status)",
              "Bash(git log)",
              "Bash(git show)",
              "Bash(git blame)",
              "Bash(git reflog)",
              "Bash(git stash list)",
              "Bash(git ls-files)",
              "Bash(git branch)",
              "Bash(git tag)",
              "Bash(git diff)",

              # File exploration tools
              "View", # Read file contents
              "GlobTool", # Find files by pattern
              "GrepTool", # Search file contents
              "BatchTool", # Run multiple tools in parallel
            ]

          # Your Anthropic API key (stored as a GitHub secret)
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Code review on pull requests

This workflow automatically reviews code changes when a PR is opened or updated:

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize] # Runs on new PRs and updates

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      # Check out the code to allow git diff operations
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch full history for accurate diffs

      - name: Run Code Review with Claude
        id: code-review
        uses: anthropics/claude-code-action@beta
        with:
          # Define the review focus areas
          prompt: "Review the PR changes. Focus on code quality, potential bugs, and performance issues. Suggest improvements where appropriate."

          # Limited tools for safer review operations
          allowed_tools: [
              "Bash(git diff --name-only HEAD~1)", # List changed files
              "Bash(git diff HEAD~1)", # See actual changes
              "View", # Read file contents
              "GlobTool", # Find related files
              "GrepTool", # Search for patterns
            ]

          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

For more focused reviews, customize the prompt to check specific aspects like security, performance, or compliance with your coding standards.

## Using with AWS Bedrock & Google Vertex AI

For enterprise environments, you can use Claude Code GitHub Actions with your own cloud infrastructure. This approach gives you control over data residency and billing while maintaining the same functionality.

### Prerequisites

Before setting up Claude Code GitHub Actions with cloud providers, you need:

#### For Google Cloud Vertex AI:

1. A Google Cloud Project with Vertex AI enabled
2. Workload Identity Federation configured for GitHub Actions
3. A service account with the required permissions
4. A GitHub App (recommended) or use the default GITHUB_TOKEN

#### For AWS Bedrock:

1. An AWS account with Amazon Bedrock enabled
2. GitHub OIDC Identity Provider configured in AWS
3. An IAM role with Bedrock permissions
4. A GitHub App (recommended) or use the default GITHUB_TOKEN

## Troubleshooting

### Claude not responding to @claude commands

Verify the GitHub App is installed correctly, check that workflows are enabled, ensure API key is set in repository secrets, and confirm the comment contains `@claude` (not `/claude`).

### CI not running on Claude’s commits

Ensure you’re using the GitHub App or custom app (not Actions user), check workflow triggers include the necessary events, and verify app permissions include CI triggers.

Confirm API key is valid and has sufficient permissions. For Bedrock/Vertex, check credentials configuration and ensure secrets are named correctly in workflows.

## Advanced configuration

### Action parameters

The Claude Code Action supports these key parameters:

| Parameter           | Description                    | Required |
| ------------------- | ------------------------------ | -------- |
| `prompt`            | The prompt to send to Claude   | Yes\*    |
| `prompt_file`       | Path to file containing prompt | Yes\*    |
| `allowed_tools`     | Array of allowed tools         | No       |
| `anthropic_api_key` | Anthropic API key              | Yes\*\*  |
| `max_turns`         | Maximum conversation turns     | No       |
| `timeout_minutes`   | Execution timeout              | No       |

\*Either `prompt` or `prompt_file` required  
\*\*Required for direct Anthropic API, not for Bedrock/Vertex

### Alternative integration methods

While the `/install-github-app` command is the recommended approach, you can also:

- **Custom GitHub App**: For organizations needing branded usernames or custom authentication flows. Create your own GitHub App with required permissions (contents, issues, pull requests) and use the actions/create-github-app-token action to generate tokens in your workflows.
- **Manual GitHub Actions**: Direct workflow configuration for maximum flexibility
- **MCP Configuration**: Dynamic loading of Model Context Protocol servers

See the [Claude Code Action repository](https://github.com/anthropics/claude-code-action) for detailed documentation.

### Customizing Claude’s behavior

You can configure Claude’s behavior in two ways:

1. **CLAUDE.md**: Define coding standards, review criteria, and project-specific rules in a `CLAUDE.md` file at the root of your repository. Claude will follow these guidelines when creating PRs and responding to requests. Check out our [Memory documentation](https://docs.anthropic.com/en/docs/claude-code/memory) for more details.
2. **Custom prompts**: Use the `prompt` parameter in the workflow file to provide workflow-specific instructions. This allows you to customize Claude’s behavior for different workflows or tasks.

Claude will follow these guidelines when creating PRs and responding to requests.
