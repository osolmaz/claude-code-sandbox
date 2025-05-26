# Lift and Shift Credentials

This document explains how `claude-sandbox` automatically transfers Claude credentials from your host machine to the Docker container.

## Overview

Claude Code stores authentication credentials in different locations depending on your operating system and how you authenticated. The `claude-sandbox` tool automatically detects and copies these credentials to ensure Claude Code works seamlessly in the container.

## Credential Sources

### macOS Keychain (Priority 1)

On macOS, Claude Code stores OAuth credentials in the system Keychain. These are automatically extracted using:

```bash
security find-generic-password -s "Claude Code-credentials" -w
```

The credentials are stored as JSON:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1748276587173,
    "scopes": ["user:inference", "user:profile"]
  }
}
```

These credentials are copied to: `/home/claude/.claude/.credentials.json`

### API Key Configuration (Priority 2)

If you have an API key stored in `~/.claude.json`:

```json
{
  "api_key": "sk-ant-api03-..."
}
```

This file is copied to: `/home/claude/.claude.json`

### Environment Variable (Priority 3)

If `ANTHROPIC_API_KEY` is set in your environment, it's passed to the container:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### Existing .claude Directory (Fallback)

On non-macOS systems, if `~/.claude/` directory exists, it's copied entirely to the container.

## File Permissions

All copied credential files are set with appropriate permissions:

- `.claude/` directory: `700` (owner read/write/execute only)
- `.credentials.json`: `600` (owner read/write only)
- `.claude.json`: `644` (owner read/write, others read)

## Security Considerations

1. **Keychain Access**: On macOS, you may be prompted to allow terminal access to your Keychain
2. **File Ownership**: All files are owned by the `claude` user in the container
3. **No Root Access**: Claude Code runs as a non-root user for security
4. **Credential Updates**: Changes to credentials in the container don't affect your host

## Troubleshooting

### macOS Keychain Access Denied

If you see "No Claude credentials found in macOS Keychain", ensure:

1. You've logged into Claude Code on your host machine
2. Terminal has Keychain access permissions
3. The credential name is exactly "Claude Code-credentials"

### Missing Credentials

If Claude Code prompts for login in the container:

1. Check if credentials exist on your host
2. Verify file permissions in the container
3. Try setting `ANTHROPIC_API_KEY` as a fallback

### Manual Credential Setup

You can manually copy credentials into a running container:

```bash
docker exec -it <container-id> bash
# Inside container:
mkdir -p ~/.claude
echo '{"api_key": "your-key"}' > ~/.claude.json
```

## Platform Support

- **macOS**: Full support with Keychain integration
- **Linux**: Supports file-based credentials
- **Windows**: Supports file-based credentials (WSL recommended)
