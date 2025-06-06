# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Claude Code Sandbox project - a CLI tool that runs Claude Code instances inside isolated Docker containers with automatic git integration. The tool creates safe sandboxed environments where Claude can execute commands and make code changes without affecting the host system.

## Common Development Commands

### Build and Development

- `npm run build` - Compile TypeScript to JavaScript (output in `dist/`)
- `npm run dev` - Watch mode for TypeScript compilation
- `npm start` - Run the CLI tool

### Testing and Quality

- `npm run lint` - Run ESLint on TypeScript files
- `npm test` - Run Jest tests

### Container Management

- `npm run purge-containers` - Remove all Claude Sandbox containers and images

## Architecture

### Core Components

1. **CLI Entry Point** (`src/cli.ts`)

   - Command-line interface using Commander.js
   - Handles options parsing and main flow orchestration

2. **Container Management** (`src/container.ts`)

   - Docker container lifecycle management using dockerode
   - Builds images, creates containers, handles streams
   - Manages volume mounts for credentials and workspace

3. **Git Integration** (`src/git-monitor.ts`)

   - Monitors git repository for new commits
   - Uses simple-git for operations
   - Provides real-time notifications of Claude's commits

4. **Credential Discovery** (`src/credentials.ts`)

   - Automatically discovers Claude API keys (Anthropic, AWS Bedrock, Google Vertex)
   - Discovers GitHub credentials (CLI auth, SSH keys)
   - Mounts credentials read-only into containers

5. **Configuration** (`src/config.ts`)

   - Loads and validates configuration from `claude-sandbox.config.json`
   - Manages Docker settings, environment variables, and Claude parameters

6. **UI Components** (`src/ui.ts`)
   - Interactive prompts using inquirer
   - Diff display with syntax highlighting
   - Commit review interface

### Key Design Decisions

- Claude runs with `--dangerously-skip-permissions` flag (safe within container isolation)
- Git wrapper prevents branch switching to protect main branch
- All credentials are mounted read-only
- Each session creates a new branch (`claude/[timestamp]`)
- Real-time commit monitoring with interactive review

### Shadow Repository Sync Principles

The shadow repository maintains a real-time sync with the container's workspace using the following principles:

1. **Git-tracked files take precedence**: Any file that is committed to the git repository will be synced to the shadow repo, regardless of whether it matches patterns in `.gitignore`
2. **Gitignore patterns apply to untracked files**: Files that are not committed to git but match `.gitignore` patterns will be excluded from sync
3. **Built-in exclusions**: Certain directories (`.git`, `node_modules`, `__pycache__`, etc.) are always excluded for performance and safety
4. **Rsync rule order**: Include rules for git-tracked files are processed before exclude rules, ensuring committed files are always preserved

This ensures that important data files (like corpora, model files, etc.) that are committed to the repository are never accidentally deleted during sync operations, even if they match common gitignore patterns like `*.zip` or `*.tar.gz`.

## Configuration

The tool looks for `claude-sandbox.config.json` in the working directory. Key options:

- `dockerImage`: Base image name
- `dockerfile`: Path to custom Dockerfile
- `environment`: Additional environment variables
- `volumes`: Additional volume mounts
- `allowedTools`: Claude tool permissions (default: all)
- `autoPush`/`autoCreatePR`: Git workflow settings

## Development Workflow

Start a new sandbox:

```
claude-sandbox start
```

Kill all running sandbox containers:

```
claude-sandbox purge -y
```
