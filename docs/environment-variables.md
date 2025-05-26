# Environment Variables

This document explains how to pass environment variables to Claude Sandbox containers.

## Overview

Claude Sandbox supports two ways to pass environment variables to containers:

1. **Inline environment variables** in the configuration file
2. **Loading from a `.env` file**

Both methods can be used together, with inline variables taking precedence over those loaded from a file.

## Configuration

### Inline Environment Variables

Add environment variables directly in your `claude-sandbox.config.json`:

```json
{
  "environment": {
    "API_KEY": "your-api-key",
    "DATABASE_URL": "postgresql://user:pass@host:5432/db",
    "NODE_ENV": "development",
    "DEBUG": "true"
  }
}
```

### Loading from .env File

Specify a path to a `.env` file to load:

```json
{
  "envFile": ".env",
  "environment": {
    "OVERRIDE_VAR": "this-overrides-env-file"
  }
}
```

The `.env` file format:

```bash
# Comments are supported
API_KEY=your-api-key
DATABASE_URL=postgresql://user:pass@host:5432/db

# Empty lines are ignored

# Quotes are optional but removed if present
QUOTED_VAR="value with spaces"
SINGLE_QUOTED='another value'

# Values can contain = signs
CONNECTION_STRING=key=value;another=value

# Export statements are ignored (just use KEY=VALUE)
NODE_ENV=development
```

## Precedence Order

Environment variables are loaded in this order (later sources override earlier ones):

1. Variables from `.env` file (if specified)
2. Inline `environment` configuration
3. Claude credentials (ANTHROPIC_API_KEY, etc.)
4. GitHub token (GITHUB_TOKEN)
5. Git author information (GIT_AUTHOR_NAME, etc.)
6. System variables (MAX_THINKING_TOKENS, etc.)

## Examples

### Basic Configuration

```json
{
  "dockerImage": "claude-code-sandbox:latest",
  "environment": {
    "MY_APP_KEY": "12345",
    "API_ENDPOINT": "https://api.example.com"
  }
}
```

### Using .env File

Create `.env`:

```bash
# Development settings
DATABASE_URL=postgresql://localhost:5432/myapp
REDIS_URL=redis://localhost:6379
SECRET_KEY=development-secret
DEBUG=true
```

Configure `claude-sandbox.config.json`:

```json
{
  "envFile": ".env",
  "environment": {
    "NODE_ENV": "development"
  }
}
```

### Multiple Environment Files

For different environments, use different config files:

`claude-sandbox.dev.json`:

```json
{
  "envFile": ".env.development",
  "environment": {
    "NODE_ENV": "development"
  }
}
```

`claude-sandbox.prod.json`:

```json
{
  "envFile": ".env.production",
  "environment": {
    "NODE_ENV": "production"
  }
}
```

Run with:

```bash
claude-sandbox --config claude-sandbox.dev.json
```

## Security Best Practices

1. **Never commit sensitive data**: Add `.env` files to `.gitignore`

   ```gitignore
   .env
   .env.*
   claude-sandbox.config.json
   ```

2. **Use placeholder values** in committed config files:

   ```json
   {
     "environment": {
       "API_KEY": "REPLACE_ME"
     }
   }
   ```

3. **Use .env files** for sensitive data:

   - Keep `.env` files local
   - Use `.env.example` with dummy values for documentation

4. **Validate required variables** in setup commands:
   ```json
   {
     "setupCommands": [
       "test -n \"$API_KEY\" || (echo 'Error: API_KEY not set' && exit 1)"
     ]
   }
   ```

## Special Environment Variables

These variables have special meaning in Claude Sandbox:

### Claude Configuration

- `ANTHROPIC_API_KEY` - Claude API key
- `CLAUDE_CODE_USE_BEDROCK` - Use AWS Bedrock
- `CLAUDE_CODE_USE_VERTEX` - Use Google Vertex
- `MAX_THINKING_TOKENS` - Maximum thinking tokens
- `BASH_MAX_TIMEOUT_MS` - Bash command timeout

### GitHub Configuration

- `GITHUB_TOKEN` - GitHub authentication token
- `GH_TOKEN` - Alternative GitHub token variable
- `GIT_AUTHOR_NAME` - Git commit author name
- `GIT_AUTHOR_EMAIL` - Git commit author email

### System Configuration

- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` - Always set to 1

## Debugging

To see what environment variables are available in the container:

```bash
# In the container
env | sort

# Or check specific variables
echo $MY_VAR
```

## Common Use Cases

### API Keys and Secrets

```json
{
  "envFile": ".env.secrets",
  "environment": {
    "API_VERSION": "v1"
  }
}
```

### Database Configuration

```json
{
  "environment": {
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DB_NAME": "myapp"
  },
  "envFile": ".env.local"
}
```

### Feature Flags

```json
{
  "environment": {
    "FEATURE_NEW_UI": "true",
    "FEATURE_BETA_API": "false"
  }
}
```

### Development Tools

```json
{
  "environment": {
    "DEBUG": "*",
    "LOG_LEVEL": "verbose",
    "PRETTY_PRINT": "true"
  }
}
```
