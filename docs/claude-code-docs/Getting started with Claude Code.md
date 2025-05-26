---
title: "Getting started with Claude Code"
source: "https://docs.anthropic.com/en/docs/claude-code/getting-started"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Learn how to install, authenticate, and start using Claude Code."
tags:
  - "clippings"
---

## Check system requirements

- **Operating Systems**: macOS 10.15+, Ubuntu 20.04+/Debian 10+, or Windows via WSL
- **Hardware**: 4GB RAM minimum
- **Software**:
  - Node.js 18+
  - [git](https://git-scm.com/downloads) 2.23+ (optional)
  - [GitHub](https://cli.github.com/) or [GitLab](https://gitlab.com/gitlab-org/cli) CLI for PR workflows (optional)
  - [ripgrep](https://github.com/BurntSushi/ripgrep?tab=readme-ov-file#installation) (rg) for enhanced file search (optional)
- **Network**: Internet connection required for authentication and AI processing
- **Location**: Available only in [supported countries](https://www.anthropic.com/supported-countries)

**Troubleshooting WSL installation**

Currently, Claude Code does not run directly in Windows, and instead requires WSL. If you encounter issues in WSL:

1. **OS/platform detection issues**: If you receive an error during installation, WSL may be using Windows `npm`. Try:
   - Run `npm config set os linux` before installation
   - Install with `npm install -g @anthropic-ai/claude-code --force --no-os-check` (Do NOT use `sudo`)
2. **Node not found errors**: If you see `exec: node: not found` when running `claude`, your WSL environment may be using a Windows installation of Node.js. You can confirm this with `which npm` and `which node`, which should point to Linux paths starting with `/usr/` rather than `/mnt/c/`. To fix this, try installing Node via your Linux distribution’s package manager or via [`nvm`](https://github.com/nvm-sh/nvm).

## Install and authenticate

## Initialize your project

For first-time users, we recommend:

Getting started with Claude Code - Anthropic
