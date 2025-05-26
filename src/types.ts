export interface SandboxConfig {
  dockerImage?: string;
  dockerfile?: string;
  detached?: boolean;
  containerPrefix?: string;
  autoPush?: boolean;
  autoCreatePR?: boolean;
  autoStartClaude?: boolean;
  claudeConfigPath?: string;
  setupCommands?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  allowedTools?: string[];
  maxThinkingTokens?: number;
  bashTimeout?: number;
}

export interface Credentials {
  claude?: {
    type: 'api_key' | 'oauth' | 'bedrock' | 'vertex';
    value: string;
    region?: string;
    project?: string;
  };
  github?: {
    token?: string;
    gitConfig?: string;
  };
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
}