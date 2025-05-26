# Claude Code Sandbox

Run Claude Code as an autonomous agent inside Docker containers with automatic git integration.

## Why Claude Code Sandbox?

The primary goal of Claude Code Sandbox is to enable **full async agentic workflows** by allowing Claude Code to execute without permission prompts. By running Claude in an isolated Docker container with the `--dangerously-skip-permissions` flag, Claude can:

- Execute any command instantly without asking for permission
- Make code changes autonomously
- Run build tools, tests, and development servers
- Create commits and manage git operations
- Work continuously without interrupting the user

This creates a truly autonomous development assistant that can work asynchronously while you focus on other tasks, similar to [OpenAI Codex](https://chatgpt.com/codex) or [Google Jules](https://jules.dev), but running locally on your machine.

## Overview

Claude Code Sandbox allows you to run Claude Code in isolated Docker containers, providing a safe environment for AI-assisted development. It automatically:

- Creates a new git branch for each session
- Monitors for commits made by Claude
- Provides interactive review of changes
- Handles credential forwarding securely
- Enables push/PR creation workflows
- Runs custom setup commands for environment initialization

## Installation

Claude Code Sandbox must be built from source:

```bash
git clone https://github.com/your-repo/claude-code-sandbox.git
cd claude-code-sandbox
npm install
npm run build
npm link  # Creates global 'claude-sandbox' command
```

### Prerequisites

- Node.js >= 18.0.0
- Docker
- Git
- Claude Code (`npm install -g @anthropic-ai/claude-code@latest`)

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

Create a `claude-sandbox.config.json` file (see `claude-sandbox.config.example.json` for reference):

```json
{
  "dockerImage": "claude-code-sandbox:latest",
  "dockerfile": "./custom.Dockerfile",
  "detached": false,
  "autoPush": true,
  "autoCreatePR": true,
  "autoStartClaude": true,
  "envFile": ".env",
  "environment": {
    "NODE_ENV": "development"
  },
  "setupCommands": ["npm install", "npm run build"],
  "volumes": ["/host/path:/container/path:ro"],
  "mounts": [
    {
      "source": "./data",
      "target": "/workspace/data",
      "readonly": false
    },
    {
      "source": "/home/user/configs",
      "target": "/configs",
      "readonly": true
    }
  ],
  "allowedTools": ["*"],
  "maxThinkingTokens": 100000,
  "bashTimeout": 600000,
  "containerPrefix": "my-project",
  "claudeConfigPath": "~/.claude.json"
}
```

#### Configuration Options

- `dockerImage`: Base Docker image to use (default: `claude-code-sandbox:latest`)
- `dockerfile`: Path to custom Dockerfile (optional)
- `detached`: Run container in detached mode
- `autoPush`: Automatically push branches after commits
- `autoCreatePR`: Automatically create pull requests
- `autoStartClaude`: Start Claude Code automatically (default: true)
- `envFile`: Load environment variables from file (e.g., `.env`)
- `environment`: Additional environment variables
- `setupCommands`: Commands to run after container starts (e.g., install dependencies)
- `volumes`: Legacy volume mounts (string format)
- `mounts`: Modern mount configuration (object format)
- `allowedTools`: Claude tool permissions (default: all)
- `maxThinkingTokens`: Maximum thinking tokens for Claude
- `bashTimeout`: Timeout for bash commands in milliseconds
- `containerPrefix`: Custom prefix for container names
- `claudeConfigPath`: Path to Claude configuration file

#### Mount Configuration

The `mounts` array allows you to mount files or directories into the container:

- `source`: Path on the host (relative paths are resolved from current directory)
- `target`: Path in the container (relative paths are resolved from /workspace)
- `readonly`: Optional boolean to make the mount read-only (default: false)

Example use cases:

- Mount data directories that shouldn't be in git
- Share configuration files between host and container
- Mount build artifacts or dependencies
- Access host system resources (use with caution)

## Features

### Automatic Credential Discovery

Claude Code Sandbox automatically discovers and forwards:

**Claude Credentials:**

- Anthropic API keys (`ANTHROPIC_API_KEY`)
- macOS Keychain credentials (Claude Code)
- AWS Bedrock credentials
- Google Vertex credentials
- Claude configuration files (`.claude.json`, `.claude/`)

**GitHub Credentials:**

- GitHub CLI authentication (`gh auth`)
- GitHub tokens (`GITHUB_TOKEN`, `GH_TOKEN`)
- Git configuration (`.gitconfig`)

### Sandboxed Execution

- Claude runs with `--dangerously-skip-permissions` flag (safe in container)
- Creates isolated branch for each session
- Full access to run any command within the container
- Files are copied into container (not mounted) for true isolation
- Git history preserved for proper version control

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
FROM claude-code-sandbox:latest

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
npm install -g @anthropic-ai/claude-code@latest
```

### Docker permission issues

Add your user to the docker group:

```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### Container cleanup

Remove all Claude Sandbox containers and images:

```bash
npm run purge-containers
```

### Credential discovery fails

Set credentials explicitly:

```bash
export ANTHROPIC_API_KEY=your-key
export GITHUB_TOKEN=your-token
```

Or use an `.env` file with `envFile` config option.

### Build errors

Ensure you're using Node.js >= 18.0.0:

```bash
node --version
```

## Development

### Available Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Watch mode for development
- `npm start` - Run the CLI
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run purge-containers` - Clean up all containers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linter: `npm run lint`
6. Submit a pull request

## License

MIT
