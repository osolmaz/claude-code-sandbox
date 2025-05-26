---
title: "Manage costs effectively"
source: "https://docs.anthropic.com/en/docs/claude-code/costs"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Learn how to track and optimize token usage and costs when using Claude Code."
tags:
  - "clippings"
---

Claude Code consumes tokens for each interaction. The average cost is $6 per developer per day, with daily costs remaining below $12 for 90% of users.

## Track your costs

- Use `/cost` to see current session usage
- **Anthropic Console users**:
  - Check [historical usage](https://support.anthropic.com/en/articles/9534590-cost-and-usage-reporting-in-console) in the Anthropic Console (requires Admin or Billing role)
  - Set [workspace spend limits](https://support.anthropic.com/en/articles/9796807-creating-and-managing-workspaces) for the Claude Code workspace (requires Admin role)
- **Max plan users**: Usage is included in your Max plan subscription

## Reduce token usage

- **Compact conversations:**
  - Claude uses auto-compact by default when context exceeds 95% capacity
  - Toggle auto-compact: Run `/config` and navigate to “Auto-compact enabled”
  - Use `/compact` manually when context gets large
  - Add custom instructions: `/compact Focus on code samples and API usage`
  - Customize compaction by adding to CLAUDE.md:
- **Write specific queries:** Avoid vague requests that trigger unnecessary scanning
- **Break down complex tasks:** Split large tasks into focused interactions
- **Clear history between tasks:** Use `/clear` to reset context

Costs can vary significantly based on:

- Size of codebase being analyzed
- Complexity of queries
- Number of files being searched or modified
- Length of conversation history
- Frequency of compacting conversations
- Background processes (haiku generation, conversation summarization)

## Background token usage

Claude Code uses tokens for some background functionality even when idle:

- **Haiku generation**: Small creative messages that appear while you type (approximately 1 cent per day)
- **Conversation summarization**: Background jobs that summarize previous conversations for the `claude --resume` feature
- **Command processing**: Some commands like `/cost` may generate requests to check status

These background processes consume a small amount of tokens (typically under $0.04 per session) even without active interaction.

For team deployments, we recommend starting with a small pilot group to establish usage patterns before wider rollout.
