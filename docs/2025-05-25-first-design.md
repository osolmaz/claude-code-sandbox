## Claude Sandbox Requirements Summary

### Core Concept

Claude-sandbox is a tool that runs Claude Code as an interactive agent inside Docker containers, providing a sandboxed environment for autonomous coding with git integration.

### Key Functional Requirements

#### 1. **Launch Behavior**

- Simple command: just type `claude-sandbox` in any git repository
- No pre-specified task - users interact with Claude directly after launch
- Claude Code runs as an interactive REPL (like a smart terminal)
- Maintains persistent context throughout the session (never exits)

#### 2. **Sandboxing**

- Runs inside Docker container for complete isolation
- Claude has full permissions to run any command (since it's sandboxed)
- No permission prompts - everything is auto-allowed
- Environment can be customized via Dockerfile configuration

#### 3. **Credential Management**

- Automatically discovers and forwards Claude credentials from host:
  - Claude Max OAuth tokens
  - Anthropic API keys
  - AWS Bedrock credentials
- Automatically forwards GitHub credentials:
  - GitHub CLI authentication
  - SSH keys
  - Git configuration

#### 4. **Git Workflow**

- **CRITICAL**: NO branch switching happens on the host machine - EVER
- Host repository stays on whatever branch the user is currently on
- **CRITICAL**: Files must be COPIED into the container, NOT mounted
  - This ensures git operations in the container don't affect the host
  - Container gets a snapshot of the current working directory
  - Changes made in container don't affect host until explicitly exported
- Inside the container:
  - A new branch `claude/[timestamp]` is created from the current state
  - All work happens on this new branch
  - Claude can make commits but cannot switch to other branches
- Git wrapper prevents branch switching operations within container

#### 5. **Change Detection & Review**

- Real-time monitoring for new commits
- When commit detected:
  - User gets notification
  - Can detach from Claude session
  - Review full diffs with syntax highlighting
  - See commit statistics
- Interactive review options:
  - Do nothing (continue working)
  - Push branch to remote
  - Push branch and create PR
  - Exit

#### 6. **Asynchronous Operation**

- Multiple containers can run simultaneously
- Each gets its own branch and isolated environment
- Fire-and-forget model for parallel work

### Technical Implementation Details

#### Docker Container Setup

- Base image with all necessary tools (git, gh CLI, build tools)
- Claude Code installed globally
- SSH configured for GitHub
- Auto-permission wrapper to bypass all prompts

#### Monitoring System

- Watches for file changes
- Detects git commits
- Tracks Claude's activity state
- Determines when tasks are complete

#### User Experience Flow

1. Run `claude-sandbox` in repo
2. System creates new branch
3. Docker container starts with Claude Code
4. User chats with Claude naturally
5. Claude works, makes changes, commits
6. User sees commit notifications
7. Can detach anytime to review changes
8. Choose to push/PR after review

### Design Principles

- **Zero configuration** - works out of the box
- **Natural interaction** - chat with Claude like normal
- **Full visibility** - see all changes before they leave the machine
- **Safe by default** - everything happens in isolated branches
- **Credential security** - read-only mounts, no credential exposure

This creates an experience where Claude Code becomes a powerful local development companion that can work autonomously while maintaining full user control over what gets pushed to the repository.

---

## Original Requirements

Look into Claude Code documentation. I want to be able to run it locally as an asynchronous agent inside Docker containers. So basically I will go into a repo, and then I just want to be able to fire off a command line tool. This command will automatically start a Docker container and fire off Claude code. The thing with Cohort code is it's the terminal utility/agent that can run commands, and the point of firing it in a Docker container is to provide a sandbox to it. The sandbox should automatically notice when Claude Code makes a change to the code. First, it should detect if Claude Code is finished with his job. And when it stops responding, and it detects that Claude code has made some line changes. It should push those changes to a new branch in the GitHub repo which it was started in. Since Claude code will be running inside a sandbox, it should be started with the mode which lets it run any command at once because it won't have access to the outside thing. So it should also be able to change the code however it likes or run any command that is available in the environment. Because it will stay inside the container and will not reach outside the container. The tool should furthermore have configuration like where the user is able to specify the environment setup possibly through a Dockerfile configuration or something like that. The basic function of this utility is to let you run fire off agents locally and work on them asynchronously, like OpenAI Codex or Google Jules. First of all, do some research on Claude Code, the most recent publishing and documentations on Anthropic website. Then, clean up this writing, make it concise and comprehensive, and outline how this thing could be implemented. You get the idea. If there are any missing points, fill in the gaps.

One thing, Claude shouldn't exit. If it exits, then the context is lost. There should be a way to figure out that it's done without making it quit. Also, this tool should automatically get the credential from the "outside" claude code is using (whether that is local bearer tokens to an account with claude max plan or an anthropic api key) and use it in the container. Also, it should be able to run all the tools/commands without permission, since this is a sandbox.

It should also get the outside github credential, to be able to push a new branch and create a new PR. In fact, the container should start with a new branch. Then, Claude Code should be able to make a commit (but not switch to a different branch. It has to stay in the current branch). As soon as a commit is made, the tool should detect it. The tool should then let the user review the diffs, line of diffs of the code. After reviewing, it should let the user do a) do nothing, b) push the branch, or c) push the branch and create a PR.

This tool should be called claude-sandbox. You should just be able to fire it without running a command. Claude code is like a very smart repl that just does stuff for you. So most people would directly type the command after claude starts, not in the terminal. Make sure your implementation matches the most recent claude code interface/api, allowed tools, etc. Look at the most recent documentation. Claude code github actions can be your reference: https://github.com/anthropics/claude-code-base-action https://github.com/anthropics/claude-code-action
