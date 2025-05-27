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
    
    // Remove any existing shadow repo completely
    if (await fs.pathExists(this.shadowPath)) {
      try {
        // Force remove with sudo if needed
        await execAsync(`rm -rf ${this.shadowPath}`);
      } catch (error) {
        // Fallback to fs.remove
        await fs.remove(this.shadowPath);
      }
    }
    
    // Clone with minimal data
    try {
      // First, determine the current branch in the original repo
      const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
        cwd: this.options.originalRepo 
      });
      const sourceBranch = currentBranch.trim() || 'main';
      
      // Try different clone approaches for robustness
      let cloneSuccess = false;
      
      // Approach 1: Try standard clone
      try {
        const cloneCmd = `git clone --single-branch --branch ${sourceBranch} --depth 1 "${this.options.originalRepo}" "${this.shadowPath}"`;
        await execAsync(cloneCmd);
        cloneSuccess = true;
      } catch (cloneError) {
        console.log(chalk.yellow('  Standard clone failed, trying alternative...'));
        
        // Approach 2: Try without depth limit
        try {
          const cloneCmd = `git clone --single-branch --branch ${sourceBranch} "${this.options.originalRepo}" "${this.shadowPath}"`;
          await execAsync(cloneCmd);
          cloneSuccess = true;
        } catch (cloneError2) {
          console.log(chalk.yellow('  Alternative clone failed, trying copy approach...'));
          
          // Approach 3: Copy working tree and init new repo
          await fs.ensureDir(this.shadowPath);
          await execAsync(`cp -r "${this.options.originalRepo}/." "${this.shadowPath}/"`);
          
          // Remove and reinit git repo
          await fs.remove(path.join(this.shadowPath, '.git'));
          await execAsync('git init', { cwd: this.shadowPath });
          await execAsync('git add .', { cwd: this.shadowPath });
          await execAsync(`git commit -m "Initial commit from ${sourceBranch}"`, { cwd: this.shadowPath });
          cloneSuccess = true;
        }
      }
      
      if (!cloneSuccess) {
        throw new Error('All clone approaches failed');
      }
      
      // Create the Claude branch locally if it's different from source
      if (this.options.claudeBranch !== sourceBranch) {
        await execAsync(`git checkout -b ${this.options.claudeBranch}`, { cwd: this.shadowPath });
      }
      
      // Configure remote to point to the actual GitHub remote, not local repo
      try {
        const { stdout: remoteUrl } = await execAsync('git remote get-url origin', { 
          cwd: this.options.originalRepo 
        });
        const actualRemote = remoteUrl.trim();
        
        if (actualRemote && !actualRemote.startsWith('/') && !actualRemote.startsWith('file://')) {
          // Set the remote to the actual GitHub/remote URL
          await execAsync(`git remote set-url origin "${actualRemote}"`, { cwd: this.shadowPath });
          console.log(chalk.blue(`  ✓ Configured remote: ${actualRemote}`));
        }
      } catch (remoteError) {
        console.log(chalk.gray('  (Could not configure remote URL, using local)'));
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
      console.log(chalk.blue('  Fixing file ownership in container...'));
      
      // Try multiple approaches to fix ownership
      let ownershipFixed = false;
      
      // Approach 1: Run as root
      try {
        await execAsync(`docker exec --user root ${containerId} chown -R claude:claude ${containerPath}`);
        ownershipFixed = true;
      } catch (rootError) {
        // Approach 2: Try without --user root
        try {
          await execAsync(`docker exec ${containerId} chown -R claude:claude ${containerPath}`);
          ownershipFixed = true;
        } catch (normalError) {
          // Approach 3: Use sudo if available
          try {
            await execAsync(`docker exec ${containerId} sudo chown -R claude:claude ${containerPath}`);
            ownershipFixed = true;
          } catch (sudoError) {
            // Continue without fixing ownership
          }
        }
      }
      
      // Verify the change worked
      if (ownershipFixed) {
        try {
          const { stdout: verification } = await execAsync(`docker exec ${containerId} ls -la ${containerPath}/README.md 2>/dev/null || echo "no readme"`);
          if (verification.includes('claude claude')) {
            console.log(chalk.green('  ✓ Container file ownership fixed'));
          } else {
            console.log(chalk.yellow('  ⚠ Ownership fix verification failed, but continuing...'));
          }
        } catch (verifyError) {
          console.log(chalk.gray('  (Could not verify ownership fix, continuing...)'));
        }
      } else {
        console.log(chalk.gray('  (Could not fix container file ownership, continuing...)'));
      }
    } catch (error) {
      console.log(chalk.gray('  (Ownership fix failed, continuing with sync...)'));
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
      // Try to install rsync if not available
      try {
        console.log(chalk.yellow('  Installing rsync in container...'));
        
        // Try different package managers
        const installCommands = [
          'apk add --no-cache rsync',           // Alpine
          'apt-get update && apt-get install -y rsync',  // Ubuntu/Debian
          'yum install -y rsync',               // CentOS/RHEL
          'dnf install -y rsync'                // Fedora
        ];
        
        for (const cmd of installCommands) {
          try {
            await execAsync(`docker exec ${containerId} sh -c "${cmd}"`);
            // Test if rsync is now available
            await execAsync(`docker exec ${containerId} which rsync`);
            console.log(chalk.green('  ✓ rsync installed successfully'));
            return true;
          } catch (cmdError) {
            // Continue to next command
            continue;
          }
        }
        
        console.log(chalk.gray('  (Could not install rsync with any package manager)'));
        return false;
      } catch (installError) {
        console.log(chalk.gray('  (Could not install rsync, using docker cp)'));
        return false;
      }
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
    
    // Create a temp directory for staging the copy
    const tempCopyPath = path.join(this.basePath, 'temp-copy');
    
    try {
      // Remove temp directory if it exists
      if (await fs.pathExists(tempCopyPath)) {
        await fs.remove(tempCopyPath);
      }
      
      // Create temp directory
      await fs.ensureDir(tempCopyPath);
      
      // Copy files to temp directory first (to avoid corrupting shadow repo)
      await execAsync(`docker cp ${containerId}:${containerPath}/. ${tempCopyPath}/`);
      
      // Now selectively copy files to shadow repo, excluding git and unwanted dirs
      const excludeDirs = ['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv'];
      const excludePatterns = excludeDirs.map(dir => `--exclude=${dir}`).join(' ');
      
      // Use rsync on host to copy files (excluding unwanted directories)
      try {
        await execAsync(`rsync -av ${excludePatterns} ${tempCopyPath}/ ${this.shadowPath}/`);
      } catch (rsyncError) {
        // Fallback to cp if rsync not available on host
        console.log(chalk.gray('  (rsync not available on host, using cp)'));
        
        // Manual copy excluding directories
        const { stdout: fileList } = await execAsync(`find ${tempCopyPath} -type f`);
        const files = fileList.trim().split('\n').filter(f => f.trim());
        
        for (const file of files) {
          const relativePath = path.relative(tempCopyPath, file);
          
          // Skip excluded directories
          if (excludeDirs.some(dir => relativePath.startsWith(dir + '/') || relativePath === dir)) {
            continue;
          }
          
          const targetPath = path.join(this.shadowPath, relativePath);
          const targetDir = path.dirname(targetPath);
          
          await fs.ensureDir(targetDir);
          await fs.copy(file, targetPath);
        }
      }
      
      // Fix ownership of copied files
      try {
        const currentUser = process.env.USER || process.env.USERNAME || 'claude';
        await execAsync(`chown -R ${currentUser}:${currentUser} ${this.shadowPath}`);
      } catch (error) {
        console.log(chalk.gray('  (Could not fix file ownership, continuing...)'));
      }
      
    } finally {
      // Clean up temp directory
      if (await fs.pathExists(tempCopyPath)) {
        await fs.remove(tempCopyPath);
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