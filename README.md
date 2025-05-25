# Claude Sandbox

Run Claude Code as an autonomous agent inside Docker containers with automatic git integration.

## Overview

Claude Sandbox allows you to run Claude Code in isolated Docker containers, providing a safe environment for AI-assisted development. It automatically:

- Creates a new git branch for each session
- Monitors for commits made by Claude
- Provides interactive review of changes
- Handles credential forwarding securely
- Enables push/PR creation workflows

## Installation

```bash
npm install -g claude-sandbox
```

Or clone and build locally:

```bash
git clone <repo>
npm install
npm run build
npm link
```

## Usage

### Basic Usage

Simply run in any git repository:

```bash
claude-sandbox
```

This will:
1. Create a new branch (`claude/[timestamp]`)
2. Start a Docker container with Claude Code
3. Forward your credentials automatically
4. Open an interactive session with Claude

### Command Options

```bash
claude-sandbox [options]

Options:
  -c, --config <path>    Path to configuration file (default: ./claude-sandbox.config.json)
  -d, --detached         Run in detached mode
  -n, --name <name>      Container name prefix
  --no-push              Disable automatic branch pushing
  --no-pr                Disable automatic PR creation
  -h, --help             Display help
  -V, --version          Display version
```

### Configuration

Create a `claude-sandbox.config.json` file:

```json
{
  "dockerImage": "claude-sandbox:latest",
  "dockerfile": "./custom.Dockerfile",
  "detached": false,
  "autoPush": true,
  "autoCreatePR": true,
  "environment": {
    "NODE_ENV": "development"
  },
  "volumes": [
    "/host/path:/container/path:ro"
  ],
  "allowedTools": ["*"],
  "maxThinkingTokens": 100000,
  "bashTimeout": 600000
}
```

## Features

### Automatic Credential Discovery

Claude Sandbox automatically discovers and forwards:

**Claude Credentials:**
- Anthropic API keys (`ANTHROPIC_API_KEY`)
- Claude Max OAuth tokens
- AWS Bedrock credentials
- Google Vertex credentials

**GitHub Credentials:**
- GitHub CLI authentication
- SSH keys
- Git configuration

### Sandboxed Execution

- Claude runs with `--dangerously-skip-permissions` flag (safe in container)
- Git wrapper prevents branch switching
- Full access to run any command within the container
- Network isolation and security

### Commit Monitoring

When Claude makes a commit:
1. Real-time notification appears
2. Full diff is displayed with syntax highlighting
3. Interactive menu offers options:
   - Continue working
   - Push branch to remote
   - Push branch and create PR
   - Exit

### Asynchronous Operation

Run multiple instances simultaneously:
```bash
# Terminal 1
claude-sandbox

# Terminal 2
claude-sandbox --name project-feature

# Terminal 3
claude-sandbox --detached --name background-task
```

## Docker Environment

### Default Image

The default Docker image includes:
- Ubuntu 22.04
- Git, GitHub CLI
- Node.js, npm
- Python 3
- Claude Code (latest)
- Build essentials

### Custom Dockerfile

Create a custom environment:

```dockerfile
FROM claude-sandbox:latest

# Add your tools
RUN apt-get update && apt-get install -y \
    rust \
    cargo \
    postgresql-client

# Install project dependencies
COPY package.json /tmp/
RUN cd /tmp && npm install

# Custom configuration
ENV CUSTOM_VAR=value
```

Reference in config:
```json
{
  "dockerfile": "./my-custom.Dockerfile"
}
```

## Workflow Example

1. **Start Claude Sandbox:**
   ```bash
   cd my-project
   claude-sandbox
   ```

2. **Interact with Claude:**
   ```
   > Help me refactor the authentication module to use JWT tokens
   ```

3. **Claude works autonomously:**
   - Explores codebase
   - Makes changes
   - Runs tests
   - Commits changes

4. **Review and push:**
   - See commit notification
   - Review syntax-highlighted diff
   - Choose to push and create PR

## Security Considerations

- Credentials are mounted read-only
- Containers are isolated from host
- Branch restrictions prevent accidental main branch modifications
- All changes require explicit user approval before pushing

## Troubleshooting

### Claude Code not found
Ensure Claude Code is installed globally:
```bash
npm install -g claude-code@latest
```

### Docker permission issues
Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
```

### Credential discovery fails
Set credentials explicitly:
```bash
export ANTHROPIC_API_KEY=your-key
export GITHUB_TOKEN=your-token
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT