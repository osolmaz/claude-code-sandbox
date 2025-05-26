---
title: "Tutorials"
source: "https://docs.anthropic.com/en/docs/claude-code/tutorials"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-26
description: "Practical examples and patterns for effectively using Claude Code in your development workflow."
tags:
  - "clippings"
---

This guide provides step-by-step tutorials for common workflows with Claude Code. Each tutorial includes clear instructions, example commands, and best practices to help you get the most from Claude Code.

- [Resume previous conversations](https://docs.anthropic.com/en/docs/claude-code/tutorials#resume-previous-conversations)
- [Understand new codebases](https://docs.anthropic.com/en/docs/claude-code/tutorials#understand-new-codebases)
- [Fix bugs efficiently](https://docs.anthropic.com/en/docs/claude-code/tutorials#fix-bugs-efficiently)
- [Refactor code](https://docs.anthropic.com/en/docs/claude-code/tutorials#refactor-code)
- [Work with tests](https://docs.anthropic.com/en/docs/claude-code/tutorials#work-with-tests)
- [Create pull requests](https://docs.anthropic.com/en/docs/claude-code/tutorials#create-pull-requests)
- [Handle documentation](https://docs.anthropic.com/en/docs/claude-code/tutorials#handle-documentation)
- [Work with images](https://docs.anthropic.com/en/docs/claude-code/tutorials#work-with-images)
- [Use extended thinking](https://docs.anthropic.com/en/docs/claude-code/tutorials#use-extended-thinking)
- [Set up project memory](https://docs.anthropic.com/en/docs/claude-code/tutorials#set-up-project-memory)
- [Set up Model Context Protocol (MCP)](https://docs.anthropic.com/en/docs/claude-code/tutorials#set-up-model-context-protocol-mcp)
- [Use Claude as a unix-style utility](https://docs.anthropic.com/en/docs/claude-code/tutorials#use-claude-as-a-unix-style-utility)
- [Create custom slash commands](https://docs.anthropic.com/en/docs/claude-code/tutorials#create-custom-slash-commands)
- [Run parallel Claude Code sessions with Git worktrees](https://docs.anthropic.com/en/docs/claude-code/tutorials#run-parallel-claude-code-sessions-with-git-worktrees)

## Resume previous conversations

### Continue your work seamlessly

**When to use:** You’ve been working on a task with Claude Code and need to continue where you left off in a later session.

Claude Code provides two options for resuming previous conversations:

- `--continue` to automatically continue the most recent conversation
- `--resume` to display a conversation picker

**How it works:**

1. **Conversation Storage**: All conversations are automatically saved locally with their full message history
2. **Message Deserialization**: When resuming, the entire message history is restored to maintain context
3. **Tool State**: Tool usage and results from the previous conversation are preserved
4. **Context Restoration**: The conversation resumes with all previous context intact

**Tips:**

- Conversation history is stored locally on your machine
- Use `--continue` for quick access to your most recent conversation
- Use `--resume` when you need to select a specific past conversation
- When resuming, you’ll see the entire conversation history before continuing
- The resumed conversation starts with the same model and configuration as the original

**Examples:**

## Understand new codebases

### Get a quick codebase overview

**When to use:** You’ve just joined a new project and need to understand its structure quickly.

**Tips:**

- Start with broad questions, then narrow down to specific areas
- Ask about coding conventions and patterns used in the project
- Request a glossary of project-specific terms

**When to use:** You need to locate code related to a specific feature or functionality.

**Tips:**

- Be specific about what you’re looking for
- Use domain language from the project

---

## Fix bugs efficiently

**When to use:** You’ve encountered an error message and need to find and fix its source.

**Tips:**

- Tell Claude the command to reproduce the issue and get a stack trace
- Mention any steps to reproduce the error
- Let Claude know if the error is intermittent or consistent

---

## Refactor code

### Modernize legacy code

**When to use:** You need to update old code to use modern patterns and practices.

**Tips:**

- Ask Claude to explain the benefits of the modern approach
- Request that changes maintain backward compatibility when needed
- Do refactoring in small, testable increments

---

## Work with tests

### Add test coverage

**When to use:** You need to add tests for uncovered code.

**Tips:**

- Ask for tests that cover edge cases and error conditions
- Request both unit and integration tests when appropriate
- Have Claude explain the testing strategy

---

## Create pull requests

### Generate comprehensive PRs

**When to use:** You need to create a well-documented pull request for your changes.

**Tips:**

- Ask Claude directly to make a PR for you
- Review Claude’s generated PR before submitting
- Ask Claude to highlight potential risks or considerations

## Handle documentation

### Generate code documentation

**When to use:** You need to add or update documentation for your code.

**Tips:**

- Specify the documentation style you want (JSDoc, docstrings, etc.)
- Ask for examples in the documentation
- Request documentation for public APIs, interfaces, and complex logic

## Work with images

### Analyze images and screenshots

**When to use:** You need to work with images in your codebase or get Claude’s help analyzing image content.

**Tips:**

- Use images when text descriptions would be unclear or cumbersome
- Include screenshots of errors, UI designs, or diagrams for better context
- You can work with multiple images in a conversation
- Image analysis works with diagrams, screenshots, mockups, and more

---

## Use extended thinking

### Leverage Claude’s extended thinking for complex tasks

**When to use:** When working on complex architectural decisions, challenging bugs, or planning multi-step implementations that require deep reasoning.

**Tips to get the most value out of extended thinking:**

Extended thinking is most valuable for complex tasks such as:

- Planning complex architectural changes
- Debugging intricate issues
- Creating implementation plans for new features
- Understanding complex codebases
- Evaluating tradeoffs between different approaches

The way you prompt for thinking results in varying levels of thinking depth:

- “think” triggers basic extended thinking
- intensifying phrases such as “think more”, “think a lot”, “think harder”, or “think longer” triggers deeper thinking

For more extended thinking prompting tips, see [Extended thinking tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).

Claude will display its thinking process as italic gray text above the response.

---

## Set up project memory

### Create an effective CLAUDE.md file

**When to use:** You want to set up a CLAUDE.md file to store important project information, conventions, and frequently used commands.

**Tips:**

- Include frequently used commands (build, test, lint) to avoid repeated searches
- Document code style preferences and naming conventions
- Add important architectural patterns specific to your project
- CLAUDE.md memories can be used for both instructions shared with your team and for your individual preferences. For more details, see [Managing Claude’s memory](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview#manage-claudes-memory).

---

## Set up Model Context Protocol (MCP)

Model Context Protocol (MCP) is an open protocol that enables LLMs to access external tools and data sources. For more details, see the [MCP documentation](https://modelcontextprotocol.io/introduction).

Use third party MCP servers at your own risk. Make sure you trust the MCP servers, and be especially careful when using MCP servers that talk to the internet, as these can expose you to prompt injection risk.

### Configure MCP servers

**When to use:** You want to enhance Claude’s capabilities by connecting it to specialized tools and external servers using the Model Context Protocol.

**Tips:**

- Use the `-s` or `--scope` flag to specify where the configuration is stored:
  - `local` (default): Available only to you in the current project (was called `project` in older versions)
  - `project`: Shared with everyone in the project via `.mcp.json` file
  - `user`: Available to you across all projects (was called `global` in older versions)
- Set environment variables with `-e` or `--env` flags (e.g., `-e KEY=value`)
- Configure MCP server startup timeout using the MCP_TIMEOUT environment variable (e.g., `MCP_TIMEOUT=10000 claude` sets a 10-second timeout)
- Check MCP server status any time using the `/mcp` command within Claude Code
- MCP follows a client-server architecture where Claude Code (the client) can connect to multiple specialized servers

### Understanding MCP server scopes

**When to use:** You want to understand how different MCP scopes work and how to share servers with your team.

**Tips:**

- Local-scoped servers take precedence over project-scoped and user-scoped servers with the same name
- Project-scoped servers (in `.mcp.json`) take precedence over user-scoped servers with the same name
- Before using project-scoped servers from `.mcp.json`, Claude Code will prompt you to approve them for security
- The `.mcp.json` file is intended to be checked into version control to share MCP servers with your team
- Project-scoped servers make it easy to ensure everyone on your team has access to the same MCP tools
- If you need to reset your choices for which project-scoped servers are enabled or disabled, use the `claude mcp reset-project-choices` command

### Connect to a Postgres MCP server

**When to use:** You want to give Claude read-only access to a PostgreSQL database for querying and schema inspection.

**Tips:**

- The Postgres MCP server provides read-only access for safety
- Claude can help you explore database structure and run analytical queries
- You can use this to quickly understand database schemas in unfamiliar projects
- Make sure your connection string uses appropriate credentials with minimum required permissions

### Add MCP servers from JSON configuration

**When to use:** You have a JSON configuration for a single MCP server that you want to add to Claude Code.

**Tips:**

- Make sure the JSON is properly escaped in your shell
- The JSON must conform to the MCP server configuration schema
- You can use `-s global` to add the server to your global configuration instead of the project-specific one

### Import MCP servers from Claude Desktop

**When to use:** You have already configured MCP servers in Claude Desktop and want to use the same servers in Claude Code without manually reconfiguring them.

**Tips:**

- This feature only works on macOS and Windows Subsystem for Linux (WSL)
- It reads the Claude Desktop configuration file from its standard location on those platforms
- Use the `-s global` flag to add servers to your global configuration
- Imported servers will have the same names as in Claude Desktop
- If servers with the same names already exist, they will get a numerical suffix (e.g., `server_1`)

### Use Claude Code as an MCP server

**When to use:** You want to use Claude Code itself as an MCP server that other applications can connect to, providing them with Claude’s tools and capabilities.

**Tips:**

- The server provides access to Claude’s tools like View, Edit, LS, etc.
- In Claude Desktop, try asking Claude to read files in a directory, make edits, and more.
- Note that this MCP server is simply exposing Claude Code’s tools to your MCP client, so your own client is responsible for implementing user confirmation for individual tool calls.

---

## Use Claude as a unix-style utility

### Add Claude to your verification process

**When to use:** You want to use Claude Code as a linter or code reviewer.

**Steps:**

### Pipe in, pipe out

**When to use:** You want to pipe data into Claude, and get back data in a structured format.

### Control output format

**When to use:** You need Claude’s output in a specific format, especially when integrating Claude Code into scripts or other tools.

**Tips:**

- Use `--output-format text` for simple integrations where you just need Claude’s response
- Use `--output-format json` when you need the full conversation log
- Use `--output-format stream-json` for real-time output of each conversation turn

---

## Create custom slash commands

Claude Code supports custom slash commands that you can create to quickly execute specific prompts or tasks.

### Create project-specific commands

**When to use:** You want to create reusable slash commands for your project that all team members can use.

**Tips:**

- Command names are derived from the filename (e.g., `optimize.md` becomes `/project:optimize`)
- You can organize commands in subdirectories (e.g., `.claude/commands/frontend/component.md` becomes `/project:frontend:component`)
- Project commands are available to everyone who clones the repository
- The Markdown file content becomes the prompt sent to Claude when the command is invoked

### Add command arguments with $ARGUMENTS

**When to use:** You want to create flexible slash commands that can accept additional input from users.

**Tips:**

- The $ARGUMENTS placeholder is replaced with any text that follows the command
- You can position $ARGUMENTS anywhere in your command template
- Other useful applications: generating test cases for specific functions, creating documentation for components, reviewing code in particular files, or translating content to specified languages

### Create personal slash commands

**When to use:** You want to create personal slash commands that work across all your projects.

**Tips:**

- Personal commands are prefixed with `/user:` instead of `/project:`
- Personal commands are only available to you and not shared with your team
- Personal commands work across all your projects
- You can use these for consistent workflows across different codebases

---

## Run parallel Claude Code sessions with Git worktrees

### Use worktrees for isolated coding environments

**When to use:** You need to work on multiple tasks simultaneously with complete code isolation between Claude Code instances.

**Tips:**

- Each worktree has its own independent file state, making it perfect for parallel Claude Code sessions
- Changes made in one worktree won’t affect others, preventing Claude instances from interfering with each other
- All worktrees share the same Git history and remote connections
- For long-running tasks, you can have Claude working in one worktree while you continue development in another
- Use descriptive directory names to easily identify which task each worktree is for
- Remember to initialize your development environment in each new worktree according to your project’s setup. Depending on your stack, this might include:
  - JavaScript projects: Running dependency installation (`npm install`, `yarn`)
  - Python projects: Setting up virtual environments or installing with package managers
  - Other languages: Following your project’s standard setup process

---

Claude Code reference implementation

Clone our development container reference implementation.

[View original](https://github.com/anthropics/claude-code/tree/main/.devcontainer)
