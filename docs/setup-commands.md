# Setup Commands

This document explains how to run custom setup commands in your Claude Sandbox container.

## Overview

Setup commands allow you to automatically run initialization scripts when your container starts. This is useful for:

- Installing project dependencies
- Setting up databases
- Configuring environment-specific settings
- Installing additional tools

## Configuration

Add a `setupCommands` array to your `claude-sandbox.config.json`:

```json
{
  "setupCommands": [
    "npm install",
    "pip install -r requirements.txt",
    "sudo apt-get update && sudo apt-get install -y postgresql-client",
    "createdb myapp_dev || true"
  ]
}
```

## Execution Order

Setup commands run:

1. **After** workspace files are copied
2. **After** git branch is created
3. **Before** Claude Code starts (if auto-start is enabled)
4. **As the `claude` user** (with sudo access)

## Examples

### Node.js Project

```json
{
  "setupCommands": ["npm install", "npm run build", "npm run db:migrate"]
}
```

### Python Project

```json
{
  "setupCommands": [
    "pip install -r requirements.txt",
    "python manage.py migrate",
    "python manage.py collectstatic --noinput"
  ]
}
```

### Installing System Packages

```json
{
  "setupCommands": [
    "sudo apt-get update",
    "sudo apt-get install -y redis-server postgresql-client",
    "sudo service redis-server start"
  ]
}
```

### Complex Setup

```json
{
  "setupCommands": [
    "# Install dependencies",
    "npm install && pip install -r requirements.txt",

    "# Set up database",
    "sudo service postgresql start",
    "createdb myapp_dev || true",
    "npm run db:migrate",

    "# Start background services",
    "redis-server --daemonize yes",
    "npm run workers:start &"
  ]
}
```

## Best Practices

1. **Use `|| true`** for commands that might fail but shouldn't stop setup:

   ```json
   ["createdb myapp_dev || true"]
   ```

2. **Chain related commands** with `&&`:

   ```json
   ["cd frontend && npm install && npm run build"]
   ```

3. **Add comments** for clarity:

   ```json
   ["# Install Python dependencies", "pip install -r requirements.txt"]
   ```

4. **Test commands** in a regular container first:
   ```bash
   docker run -it claude-code-sandbox:latest bash
   # Test your commands here
   ```

## Error Handling

- Commands are run sequentially
- If a command fails (non-zero exit code), subsequent commands still run
- Failed commands show an error message but don't stop the container
- To stop on first error, add `"set -e"` as the first command

## Working Directory

All commands run in `/workspace` (your project root) as the `claude` user.

## Environment Variables

Commands have access to:

- All environment variables from your config
- Standard container environment
- `HOME=/home/claude`
- `USER=claude`

## Limitations

- Commands run synchronously (one at a time)
- Long-running commands will delay container startup
- Background processes should be daemonized
- Output is prefixed with `>` for clarity

## Troubleshooting

### Command Not Found

Ensure the tool is installed in the Docker image or install it in your setup commands:

```json
{
  "setupCommands": ["sudo apt-get update && sudo apt-get install -y <package>"]
}
```

### Permission Denied

The `claude` user has passwordless sudo access. Prefix commands with `sudo` if needed:

```json
{
  "setupCommands": ["sudo systemctl start postgresql"]
}
```

### Command Hangs

Ensure commands don't wait for user input. Use flags like `-y` or `--yes`:

```json
{
  "setupCommands": ["sudo apt-get install -y package-name"]
}
```
