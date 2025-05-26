# GitHub Authentication

This document explains how to set up GitHub authentication for use within Claude Sandbox containers.

## Overview

Claude Sandbox uses GitHub tokens for authentication, providing a secure and simple way to access private repositories and push changes.

## Authentication Methods (in order of preference)

### 1. GitHub CLI Token (Recommended)

The most secure and convenient method:

```bash
# One-time setup on host:
gh auth login

# The token is automatically discovered and passed to containers
```

**How it works:**

- Claude Sandbox runs `gh auth token` to get your token
- Token is passed as `GITHUB_TOKEN` environment variable
- Git is configured to use the token for both HTTPS and SSH URLs
- Works for cloning, pulling, and pushing

**Benefits:**

- ✅ Cross-platform (macOS, Linux, Windows)
- ✅ Secure (tokens can be scoped)
- ✅ Easy to refresh (`gh auth refresh`)
- ✅ No manual token management

### 2. Environment Variables

Set a token in your shell:

```bash
# Using GitHub Personal Access Token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Or using GitHub CLI token
export GH_TOKEN=$(gh auth token)

# Then run
claude-sandbox
```

**Supported variables:**

- `GITHUB_TOKEN` - Standard GitHub token variable
- `GH_TOKEN` - GitHub CLI token variable

### 3. Git Configuration

Your `.gitconfig` is automatically copied to containers, preserving:

- User name and email
- Custom aliases
- Other git settings (excluding credential helpers)

## Setup Examples

### Quick Setup (GitHub CLI)

```bash
# Install GitHub CLI
brew install gh  # macOS
# or
sudo apt install gh  # Ubuntu/Debian

# Authenticate
gh auth login

# Run claude-sandbox (token is auto-detected)
claude-sandbox
```

### Manual Token Setup

1. Create a Personal Access Token:

   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create a token with `repo` scope
   - Copy the token

2. Set environment variable:
   ```bash
   export GITHUB_TOKEN=ghp_your_token_here
   claude-sandbox
   ```

## Using in Container

Once authenticated, git is automatically configured to use your token:

```bash
# Clone private repos (both HTTPS and SSH URLs work)
git clone https://github.com/username/private-repo.git
git clone git@github.com:username/private-repo.git

# Use GitHub CLI
gh repo create
gh pr create
gh issue list

# Push changes
git push origin main
```

## Configuration File

Add GitHub token to your project's `claude-sandbox.config.json`:

```json
{
  "environment": {
    "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
  }
}
```

**Warning:** Don't commit tokens to version control!

## Troubleshooting

### Permission Denied

If you get "Permission denied" errors:

1. Check if token is available:

   ```bash
   # In container
   echo $GITHUB_TOKEN
   gh auth status
   ```

2. Verify git configuration:
   ```bash
   git config --list | grep url
   ```

### Token Not Found

If no token is detected:

- Ensure you're logged in with `gh auth login`
- Or set `GITHUB_TOKEN` environment variable
- Check that the token has appropriate scopes

### Rate Limiting

If you hit rate limits:

- Ensure you're using an authenticated token
- Check rate limit: `gh api rate_limit`

## Security Best Practices

1. **Use Scoped Tokens**: Only grant necessary permissions (usually just `repo`)
2. **Rotate Tokens**: Regularly refresh tokens
3. **Don't Commit Tokens**: Use environment variables
4. **Use GitHub CLI**: It manages token lifecycle automatically

## Platform-Specific Notes

### macOS

- GitHub CLI token stored in macOS Keychain
- Git credentials may use osxkeychain helper

### Linux

- GitHub CLI token in `~/.config/gh/`
- Git credentials may use libsecret

### Windows (WSL)

- Use WSL for best compatibility
- GitHub CLI works in WSL

## Advanced Configuration

### Multiple GitHub Accounts

Use different tokens for different organizations:

```bash
# For work repos
export GITHUB_TOKEN=ghp_work_token

# For personal repos (in another session)
export GITHUB_TOKEN=ghp_personal_token
```

### Custom Git Configuration

The container automatically configures git to use tokens for all GitHub URLs:

- `https://github.com/` URLs use token authentication
- `git@github.com:` URLs are rewritten to use HTTPS with token

This means you can clone repositories using either format and authentication will work seamlessly.
