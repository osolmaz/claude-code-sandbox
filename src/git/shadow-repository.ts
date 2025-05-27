import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface ShadowRepoOptions {
  originalRepo: string;
  claudeBranch: string;  // The target Claude branch to create
  sessionId: string;
}

export class ShadowRepository {
  private shadowPath: string;
  private initialized = false;
  
  constructor(
    private options: ShadowRepoOptions,
    private basePath: string = '/tmp/claude-shadows'
  ) {
    this.shadowPath = path.join(this.basePath, this.options.sessionId);
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log(chalk.blue('🔨 Creating shadow repository...'));
    
    // Ensure base directory exists
    await fs.ensureDir(this.basePath);
    
    // Remove any existing shadow repo
    if (await fs.pathExists(this.shadowPath)) {
      await fs.remove(this.shadowPath);
    }
    
    // Clone with minimal data
    try {
      // First, determine the current branch in the original repo
      const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
        cwd: this.options.originalRepo 
      });
      const sourceBranch = currentBranch.trim() || 'main';
      
      // Clone from the current branch, not the target Claude branch
      const cloneCmd = `git clone --single-branch --branch ${sourceBranch} --depth 1 ${this.options.originalRepo} ${this.shadowPath}`;
      await execAsync(cloneCmd);
      
      // Create the Claude branch locally if it's different from source
      if (this.options.claudeBranch !== sourceBranch) {
        await execAsync(`git checkout -b ${this.options.claudeBranch}`, { cwd: this.shadowPath });
      }
      
      console.log(chalk.green('✓ Shadow repository created'));
      this.initialized = true;
    } catch (error) {
      console.error(chalk.red('Failed to create shadow repository:'), error);
      throw error;
    }
  }
  
  async syncFromContainer(containerId: string, containerPath: string = '/workspace'): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log(chalk.blue('🔄 Syncing files from container...'));
    
    // First, ensure files in container are owned by claude user
    try {
      await execAsync(`docker exec ${containerId} chown -R claude:claude ${containerPath}`);
    } catch (error) {
      console.log(chalk.gray('  (Could not fix container file ownership, continuing...)'));
    }
    
    // Check if rsync is available in container
    const hasRsync = await this.checkRsyncInContainer(containerId);
    
    if (hasRsync) {
      await this.syncWithRsync(containerId, containerPath);
    } else {
      await this.syncWithDockerCp(containerId, containerPath);
    }
    
    console.log(chalk.green('✓ Files synced successfully'));
  }
  
  private async checkRsyncInContainer(containerId: string): Promise<boolean> {
    try {
      await execAsync(`docker exec ${containerId} which rsync`);
      return true;
    } catch {
      return false;
    }
  }
  
  private async syncWithRsync(containerId: string, containerPath: string): Promise<void> {
    // Create a temporary directory in container for rsync
    const tempDir = '/tmp/sync-staging';
    await execAsync(`docker exec ${containerId} mkdir -p ${tempDir}`);
    
    // Rsync within container to staging area (excluding .git and node_modules)
    const rsyncCmd = `docker exec ${containerId} rsync -av --delete \
      --exclude=.git \
      --exclude=node_modules \
      --exclude=.next \
      --exclude=dist \
      --exclude=build \
      ${containerPath}/ ${tempDir}/`;
    
    await execAsync(rsyncCmd);
    
    // Copy from container staging to shadow repo
    await execAsync(`docker cp ${containerId}:${tempDir}/. ${this.shadowPath}/`);
    
    // Clean up staging directory
    await execAsync(`docker exec ${containerId} rm -rf ${tempDir}`);
  }
  
  private async syncWithDockerCp(containerId: string, containerPath: string): Promise<void> {
    console.log(chalk.yellow('⚠️  Using docker cp (rsync not available in container)'));
    
    // Save the git directory
    const gitBackupPath = path.join(this.basePath, '.git-backup');
    const gitPath = path.join(this.shadowPath, '.git');
    
    if (await fs.pathExists(gitPath)) {
      await fs.move(gitPath, gitBackupPath, { overwrite: true });
    }
    
    // Direct copy - less efficient but works everywhere
    await execAsync(`docker cp ${containerId}:${containerPath}/. ${this.shadowPath}/`);
    
    // Fix ownership of copied files to current user
    try {
      const currentUser = process.env.USER || process.env.USERNAME || 'claude';
      await execAsync(`chown -R ${currentUser}:${currentUser} ${this.shadowPath}`);
    } catch (error) {
      // Ignore chown errors (might not have permission or be on different OS)
      console.log(chalk.gray('  (Could not fix file ownership, continuing...)'));
    }
    
    // Restore git directory
    if (await fs.pathExists(gitBackupPath)) {
      await fs.move(gitBackupPath, gitPath, { overwrite: true });
    }
    
    // Remove unwanted directories after copy (except .git which we preserved)
    const excludeDirs = ['node_modules', '.next', 'dist', 'build'];
    for (const dir of excludeDirs) {
      const dirPath = path.join(this.shadowPath, dir);
      if (await fs.pathExists(dirPath)) {
        await fs.remove(dirPath);
      }
    }
  }
  
  async getChanges(): Promise<{ hasChanges: boolean; summary: string }> {
    const { stdout: status } = await execAsync('git status --porcelain', { 
      cwd: this.shadowPath 
    });
    
    if (!status.trim()) {
      return { hasChanges: false, summary: 'No changes detected' };
    }
    
    const lines = status.trim().split('\n');
    const modified = lines.filter(l => l.startsWith(' M')).length;
    const added = lines.filter(l => l.startsWith('??')).length;
    const deleted = lines.filter(l => l.startsWith(' D')).length;
    
    const summary = `Modified: ${modified}, Added: ${added}, Deleted: ${deleted}`;
    
    return { hasChanges: true, summary };
  }
  
  async showDiff(): Promise<void> {
    const { stdout } = await execAsync('git diff', { cwd: this.shadowPath });
    console.log(stdout);
  }
  
  async cleanup(): Promise<void> {
    if (await fs.pathExists(this.shadowPath)) {
      await fs.remove(this.shadowPath);
      console.log(chalk.gray('🧹 Shadow repository cleaned up'));
    }
  }
  
  getPath(): string {
    return this.shadowPath;
  }
}