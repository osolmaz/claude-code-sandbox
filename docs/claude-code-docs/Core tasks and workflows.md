---
title: "Core tasks and workflows"
source: "https://docs.anthropic.com/en/docs/claude-code/common-tasks"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Explore Claude Code's powerful features for editing, searching, testing, and automating your development workflow."
tags:
  - "clippings"
---

Claude Code operates directly in your terminal, understanding your project context and taking real actions. No need to manually add files to context - Claude will explore your codebase as needed.

## Understand unfamiliar code

## Automate Git operations

## Edit code intelligently

## Test and debug your code

## Encourage deeper thinking

For complex problems, explicitly ask Claude to think more deeply:

Claude Code will show when the model is using extended thinking. You can proactively prompt Claude to “think” or “think deeply” for more planning-intensive tasks. We suggest that you first tell Claude about your task and let it gather context from your project. Then, ask it to “think” to create a plan.

Claude will think more based on the words you use. For example, “think hard” will trigger more extended thinking than saying “think” alone.

For more tips, see [Extended thinking tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).

## Automate CI and infra workflows

Claude Code comes with a non-interactive mode for headless execution. This is especially useful for running Claude Code in non-interactive contexts like scripts, pipelines, and Github Actions.

Use `--print` (`-p`) to run Claude in non-interactive mode. In this mode, you can set the `ANTHROPIC_API_KEY` environment variable to provide a custom API key.

Non-interactive mode is especially useful when you pre-configure the set of commands Claude is allowed to use:
