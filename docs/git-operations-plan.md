# Safe Git Operations Implementation Plan

## Overview

This plan outlines how to safely handle Git operations (commit, push, PR) outside the container while maintaining security and seamless UX.

## Architecture

### 1. **Dual Repository Approach**

- **Container Repo**: Claude works in an isolated git repo inside the container
- **Shadow Repo**: A temporary bare repository outside the container that mirrors commits
- **Host Repo**: The original repository remains untouched

### 2. **Key Components**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Container Repo │────▶│   Shadow Repo    │────▶│  Remote GitHub  │
│  (Claude works) │     │ (Outside container)│     │   (Push/PR)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       │
         └───── Git Bundle ──────┘
```

## Implementation Details

### Phase 1: Commit Extraction System

1. **Git Bundle Mechanism**

   ```bash
   # Inside container
   git bundle create /tmp/changes.bundle <branch> ^origin/<branch>

   # Outside container
   docker cp <container>:/tmp/changes.bundle ./
   ```

2. **Shadow Repository Setup (Optimized)**
   ```typescript
   class ShadowRepository {
     private shadowPath: string;

     async initialize(originalRepo: string, branch: string) {
       // Create minimal single-branch clone
       this.shadowPath = await mkdtemp("/tmp/claude-shadow-");

       // Option 1: Shallow single-branch clone (most efficient)
       await exec(
         `git clone --single-branch --branch ${branch} --depth 1 --bare ${originalRepo} ${this.shadowPath}`,
       );

       // Option 2: Even more minimal - just init and add remote
       // await exec(`git init --bare ${this.shadowPath}`);
       // await exec(`git remote add origin ${originalRepo}`, { cwd: this.shadowPath });
       // await exec(`git fetch origin ${branch}:${branch} --depth 1`, { cwd: this.shadowPath });
     }

     async applyBundle(bundlePath: string, branch: string) {
       // Fetch commits from bundle
       await exec(`git fetch ${bundlePath} ${branch}:${branch}`, {
         cwd: this.shadowPath,
       });
     }

     async cleanup() {
       // Remove shadow repo after use
       await fs.rm(this.shadowPath, { recursive: true });
     }
   }
   ```

### Phase 2: Git Operations Handler

```typescript
interface GitOperation {
  type: "commit" | "push" | "pr";
  branch: string;
  commits: CommitInfo[];
}

class GitOperationsHandler {
  private shadow: ShadowRepository;
  private githubToken?: string;

  async extractCommits(containerId: string, branch: string) {
    // 1. Create bundle in container
    await docker.exec(containerId, [
      "git",
      "bundle",
      "create",
      "/tmp/changes.bundle",
      branch,
      `^origin/${branch}`,
    ]);

    // 2. Copy bundle out
    const bundlePath = await docker.copyFromContainer(
      containerId,
      "/tmp/changes.bundle",
    );

    // 3. Apply to shadow repo
    await this.shadow.applyBundle(bundlePath, branch);

    // 4. Get commit info
    return await this.shadow.getCommits(branch);
  }

  async push(branch: string) {
    // Use GitHub token from host environment
    const token = await this.getGitHubToken();
    await this.shadow.push(branch, token);
  }

  private async getGitHubToken() {
    // Try multiple sources in order:
    // 1. Environment variable
    // 2. GitHub CLI (gh auth token)
    // 3. Git credential helper
    // 4. macOS Keychain
  }
}
```

### Phase 3: UI Flow

```typescript
interface SessionEndOptions {
  hasChanges: boolean;
  branch: string;
  commits: CommitInfo[];
}

class SessionEndUI {
  async showOptions(options: SessionEndOptions) {
    if (!options.hasChanges) {
      return; // No UI needed
    }

    const choices = [
      {
        name: `Review ${options.commits.length} commits`,
        value: "review",
      },
      {
        name: "Push to branch",
        value: "push",
        disabled: !this.hasGitHubAccess(),
      },
      {
        name: "Create/Update PR",
        value: "pr",
        disabled: !this.hasGitHubAccess() || !options.branchExists,
      },
      {
        name: "Export as patch",
        value: "export",
      },
      {
        name: "Discard changes",
        value: "discard",
      },
    ];

    return await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do with your changes?",
        choices,
      },
    ]);
  }
}
```

### Phase 4: Security Measures

1. **Token Isolation**

   - GitHub tokens NEVER enter the container
   - All push operations happen from host process
   - Tokens retrieved just-in-time when needed

2. **Repository Protection**

   - Host repository is never modified directly
   - All operations go through shadow repository
   - User explicitly approves each operation

3. **Audit Trail**
   ```typescript
   class GitAuditLog {
     log(operation: GitOperation) {
       // Log all git operations for transparency
       console.log(`[GIT] ${operation.type} on ${operation.branch}`);
       // Store in ~/.claude-sandbox/git-operations.log
     }
   }
   ```

## Implementation Phases

### Phase 1: Basic Commit Extraction (Week 1)

- [ ] Implement git bundle creation in container
- [ ] Create shadow repository manager
- [ ] Build commit extraction pipeline
- [ ] Add commit review UI

### Phase 2: Push Functionality (Week 2)

- [ ] Implement GitHub token discovery
- [ ] Add push to shadow repository
- [ ] Create push confirmation UI
- [ ] Handle push errors gracefully

### Phase 3: PR Management (Week 3)

- [ ] Integrate with GitHub API
- [ ] Check for existing PRs
- [ ] Create/update PR functionality
- [ ] Add PR template support

### Phase 4: Enhanced UX (Week 4)

- [ ] Add commit message editing
- [ ] Implement patch export option
- [ ] Create web UI for git operations
- [ ] Add git operation history

## File Structure

```
claude-code-sandbox/
├── src/
│   ├── git/
│   │   ├── shadow-repository.ts
│   │   ├── git-operations-handler.ts
│   │   ├── github-integration.ts
│   │   └── git-audit-log.ts
│   ├── ui/
│   │   ├── session-end-ui.ts
│   │   └── git-review-ui.ts
│   └── credentials/
│       └── github-token-provider.ts
```

## Example Usage Flow

1. **Claude makes commits in container**

   ```bash
   # Inside container
   git commit -m "Add new feature"
   git commit -m "Fix bug"
   ```

2. **Session ends, UI appears**

   ```
   🔔 Claude made 2 commits. What would you like to do?

   ❯ Review commits
     Push to branch 'claude/2025-01-27-feature'
     Create PR from 'claude/2025-01-27-feature'
     Export as patch
     Discard changes
   ```

3. **User selects "Push to branch"**

   ```
   🔐 Authenticating with GitHub...
   ✓ Found GitHub token

   📤 Pushing 2 commits to 'claude/2025-01-27-feature'
   ✓ Successfully pushed to GitHub

   🔗 View branch: https://github.com/user/repo/tree/claude/2025-01-27-feature
   ```

## Benefits

1. **Security**: GitHub tokens never enter container
2. **Safety**: Original repository untouched
3. **Flexibility**: Multiple export options
4. **Transparency**: All operations logged
5. **Seamless UX**: Feels like normal git workflow

## Technical Considerations

1. **Bundle Limitations**

   - Bundles only contain commit objects
   - Large binary files may need special handling

2. **Shadow Repository Efficiency**

   - Only clones the specific branch Claude is working on
   - Shallow clone (--depth 1) to minimize data transfer
   - Bare repository (no working tree) saves disk space
   - Temporary repos cleaned immediately after use
   - For large repos, can use partial clone: `--filter=blob:none`

3. **Minimal Shadow Repo Approach**

   ```bash
   # Ultra-minimal: Just enough to receive and push commits
   git init --bare /tmp/shadow
   git -C /tmp/shadow remote add origin <repo-url>
   git -C /tmp/shadow fetch <bundle> <branch>:<branch>
   git -C /tmp/shadow push origin <branch>
   ```

4. **Error Handling**
   - Network failures during push
   - Merge conflicts detection
   - Token expiration handling

## Alternative Approaches Considered

1. **Git Worktree**: Too complex, modifies host repo
2. **Direct Push from Container**: Security risk
3. **Manual Patch Export**: Poor UX
4. **Shared Volume**: Risky, could corrupt host repo

## Next Steps

1. Prototype git bundle extraction
2. Test shadow repository approach
3. Build minimal UI for testing
4. Gather feedback on UX flow
