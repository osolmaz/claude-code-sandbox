---
title: "Manage Claude's memory"
source: "https://docs.anthropic.com/en/docs/claude-code/memory"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Learn how to manage Claude Code's memory across sessions with different memory locations and best practices."
tags:
  - "clippings"
---

Claude Code can remember your preferences across sessions, like style guidelines and common commands in your workflow.

## Determine memory type

Claude Code offers three memory locations, each serving a different purpose:

| Memory Type                | Location              | Purpose                                  | Use Case Examples                                                |
| -------------------------- | --------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| **Project memory**         | `./CLAUDE.md`         | Team-shared instructions for the project | Project architecture, coding standards, common workflows         |
| **User memory**            | `~/.claude/CLAUDE.md` | Personal preferences for all projects    | Code styling preferences, personal tooling shortcuts             |
| **Project memory (local)** | `./CLAUDE.local.md`   | Personal project-specific preferences    | _(Deprecated, see below)_ Your sandbox URLs, preferred test data |

All memory files are automatically loaded into Claude Code’s context when launched.

## CLAUDE.md imports

CLAUDE.md files can import additional files using `@path/to/import` syntax. The following example imports 3 files:

Both relative and absolute paths are allowed. In particular, importing files in user’s home dir is a convenient way for your team members to provide individual instructions that are not checked into the repository. Previously CLAUDE.local.md served a similar purpose, but is now deprecated in favor of imports since they work better across multiple git worktrees.

To avoid potential collisions, imports are not evaluated inside markdown code spans and code blocks.

Imported files can recursively import additional files, with a max-depth of 5 hops. You can see what memory files are loaded by running `/memory` command.

## How Claude looks up memories

Claude Code reads memories recursively: starting in the cwd, Claude Code recurses up to _/_ and reads any CLAUDE.md or CLAUDE.local.md files it finds. This is especially convenient when working in large repositories where you run Claude Code in _foo/bar/_, and have memories in both _foo/CLAUDE.md_ and _foo/bar/CLAUDE.md_.

Claude will also discover CLAUDE.md nested in subtrees under your current working directory. Instead of loading them at launch, they are only included when Claude reads files in those subtrees.

## Quickly add memories with the # shortcut

The fastest way to add a memory is to start your input with the `#` character:

You’ll be prompted to select which memory file to store this in.

## Directly edit memories with /memory

Use the `/memory` slash command during a session to open any memory file in your system editor for more extensive additions or organization.

## Memory best practices

- **Be specific**: “Use 2-space indentation” is better than “Format code properly”.
- **Use structure to organize**: Format each individual memory as a bullet point and group related memories under descriptive markdown headings.
- **Review periodically**: Update memories as your project evolves to ensure Claude is always using the most up to date information and context.
