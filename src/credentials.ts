import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Credentials } from './types';

export class CredentialManager {
  async discover(): Promise<Credentials> {
    const credentials: Credentials = {};
    
    // Discover Claude credentials
    credentials.claude = await this.discoverClaudeCredentials();
    
    // Discover GitHub credentials
    credentials.github = await this.discoverGitHubCredentials();
    
    return credentials;
  }

  private async discoverClaudeCredentials(): Promise<Credentials['claude']> {
    // Check environment variables
    if (process.env.ANTHROPIC_API_KEY) {
      return {
        type: 'api_key',
        value: process.env.ANTHROPIC_API_KEY,
      };
    }
    
    // Check for Bedrock configuration
    if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
      return {
        type: 'bedrock',
        value: 'bedrock',
        region: process.env.AWS_REGION || 'us-east-1',
      };
    }
    
    // Check for Vertex configuration
    if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
      return {
        type: 'vertex',
        value: 'vertex',
        project: process.env.GOOGLE_CLOUD_PROJECT,
      };
    }
    
    // Try to find OAuth tokens (Claude Max)
    const oauthToken = await this.findOAuthToken();
    if (oauthToken) {
      return {
        type: 'oauth',
        value: oauthToken,
      };
    }
    
    throw new Error('No Claude credentials found. Please set ANTHROPIC_API_KEY or log in to Claude.');
  }

  private async findOAuthToken(): Promise<string | null> {
    // Check common locations for Claude OAuth tokens
    const possiblePaths = [
      path.join(os.homedir(), '.claude', 'auth.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'auth.json'),
      path.join(os.homedir(), '.config', 'claude', 'auth.json'),
    ];
    
    for (const authPath of possiblePaths) {
      try {
        const content = await fs.readFile(authPath, 'utf-8');
        const auth = JSON.parse(content);
        if (auth.access_token) {
          return auth.access_token;
        }
      } catch {
        // Continue checking other paths
      }
    }
    
    // Try to get from system keychain (macOS)
    if (process.platform === 'darwin') {
      try {
        const token = execSync('security find-generic-password -s "claude-auth" -w 2>/dev/null', {
          encoding: 'utf-8',
        }).trim();
        if (token) return token;
      } catch {
        // Keychain access failed
      }
    }
    
    return null;
  }

  private async discoverGitHubCredentials(): Promise<Credentials['github']> {
    const github: Credentials['github'] = {};
    
    // Check for GitHub token
    if (process.env.GITHUB_TOKEN) {
      github.token = process.env.GITHUB_TOKEN;
    } else {
      // Try to get from gh CLI
      try {
        const token = execSync('gh auth token 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (token) github.token = token;
      } catch {
        // gh CLI not available or not authenticated
      }
    }
    
    // Check for SSH key
    const sshKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    try {
      github.sshKey = await fs.readFile(sshKeyPath, 'utf-8');
    } catch {
      // Try ed25519 key
      try {
        const ed25519Path = path.join(os.homedir(), '.ssh', 'id_ed25519');
        github.sshKey = await fs.readFile(ed25519Path, 'utf-8');
      } catch {
        // No SSH key found
      }
    }
    
    // Get git config
    try {
      const gitConfig = await fs.readFile(path.join(os.homedir(), '.gitconfig'), 'utf-8');
      github.gitConfig = gitConfig;
    } catch {
      // No git config found
    }
    
    return github;
  }
}