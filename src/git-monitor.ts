import { SimpleGit } from "simple-git";
import { EventEmitter } from "events";
import chokidar from "chokidar";
import path from "path";
import { CommitInfo } from "./types";

export class GitMonitor extends EventEmitter {
  private git: SimpleGit;
  private watcher: chokidar.FSWatcher | null = null;
  private lastCommitHash: string = "";
  private monitoring = false;

  constructor(git: SimpleGit) {
    super();
    this.git = git;
  }

  async start(_branchName: string): Promise<void> {
    this.monitoring = true;

    // Get initial commit hash
    const log = await this.git.log({ maxCount: 1 });
    this.lastCommitHash = log.latest?.hash || "";

    // Only watch if we're monitoring the host (for now we'll disable this)
    // TODO: This should watch the container's git directory instead
    console.log(
      "Note: Git monitoring is currently disabled for container isolation",
    );
    return;

    // Watch .git directory for changes
    const gitDir = path.join(process.cwd(), ".git");
    this.watcher = chokidar.watch(gitDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 2,
    });

    this.watcher!.on("change", async (filepath) => {
      if (!this.monitoring) return;

      // Check if there's a new commit
      if (filepath.includes("refs/heads") || filepath.includes("logs/HEAD")) {
        await this.checkForNewCommit();
      }
    });

    // Also poll periodically as backup
    this.startPolling();
  }

  async stop(): Promise<void> {
    this.monitoring = false;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async checkForNewCommit(): Promise<void> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      const latestHash = log.latest?.hash || "";

      if (latestHash && latestHash !== this.lastCommitHash) {
        this.lastCommitHash = latestHash;

        // Get commit details
        const commit = await this.getCommitInfo(latestHash);
        this.emit("commit", commit);
      }
    } catch (error) {
      console.error("Error checking for new commit:", error);
    }
  }

  private async getCommitInfo(hash: string): Promise<CommitInfo> {
    const log = await this.git.log({ from: hash, to: hash, maxCount: 1 });
    const commit = log.latest!;

    // Get list of changed files
    const diff = await this.git.diffSummary([`${hash}~1`, hash]);
    const files = diff.files.map((f) => f.file);

    return {
      hash: commit.hash,
      author: commit.author_name,
      date: commit.date,
      message: commit.message,
      files,
    };
  }

  private startPolling(): void {
    const pollInterval = setInterval(async () => {
      if (!this.monitoring) {
        clearInterval(pollInterval);
        return;
      }
      await this.checkForNewCommit();
    }, 2000); // Poll every 2 seconds
  }
}
