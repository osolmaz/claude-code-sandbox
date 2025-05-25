FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    openssh-client \
    python3 \
    python3-pip \
    build-essential \
    sudo \
    vim \
    jq \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code@latest

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Create a wrapper script for git that prevents branch switching
RUN echo '#!/bin/bash\n\
# Allow the initial branch creation\n\
if [ ! -f /tmp/.branch-created ]; then\n\
    /usr/bin/git.real "$@"\n\
    if [[ "$1" == "checkout" ]] && [[ "$2" == "-b" ]]; then\n\
        touch /tmp/.branch-created\n\
    fi\n\
else\n\
    # After initial branch creation, prevent switching\n\
    if [[ "$1" == "checkout" ]] && [[ "$2" != "-b" ]] && [[ "$*" != *"--"* ]]; then\n\
        echo "Error: Branch switching is disabled in claude-code-sandbox"\n\
        echo "You can only create new branches with git checkout -b"\n\
        exit 1\n\
    fi\n\
    if [[ "$1" == "switch" ]]; then\n\
        echo "Error: Branch switching is disabled in claude-code-sandbox"\n\
        exit 1\n\
    fi\n\
    /usr/bin/git.real "$@"\n\
fi' > /usr/local/bin/git-wrapper && \
    chmod +x /usr/local/bin/git-wrapper && \
    mv /usr/bin/git /usr/bin/git.real && \
    ln -s /usr/local/bin/git-wrapper /usr/bin/git

# Set up SSH config
RUN mkdir -p /root/.ssh && \
    echo "Host github.com\n\
    StrictHostKeyChecking no\n\
    UserKnownHostsFile /dev/null" > /root/.ssh/config && \
    chmod 600 /root/.ssh/config

# Set git to use credential helper
RUN git config --global credential.helper 'cache --timeout=3600'

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Copy SSH keys if mounted\n\
if [ -d "/tmp/.ssh" ]; then\n\
    cp -r /tmp/.ssh/* /root/.ssh/ 2>/dev/null || true\n\
    chmod 600 /root/.ssh/* 2>/dev/null || true\n\
fi\n\
\n\
# Copy git config if mounted\n\
if [ -f "/tmp/.gitconfig" ]; then\n\
    cp /tmp/.gitconfig /root/.gitconfig\n\
fi\n\
\n\
# Execute the command\n\
exec "$@"' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]