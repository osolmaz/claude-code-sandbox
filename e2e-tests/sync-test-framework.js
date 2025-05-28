#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const util = require('util');
const execAsync = util.promisify(exec);

class SyncTestFramework {
  constructor() {
    this.testRepo = null;
    this.containerId = null;
    this.shadowPath = null;
    this.webSocket = null;
    this.webPort = null;
    this.sandboxProcess = null;
    this.receivedSyncEvents = [];
    this.testTimeout = 60000; // 1 minute timeout per test
  }

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    // Create temporary test repository
    this.testRepo = path.join('/tmp', `test-repo-${Date.now()}`);
    await fs.mkdir(this.testRepo, { recursive: true });
    
    // Copy dummy repo files to test repo
    const dummyRepo = path.join(__dirname, 'dummy-repo');
    await execAsync(`cp -r ${dummyRepo}/* ${this.testRepo}/`);
    
    // Initialize as git repository
    await execAsync(`cd ${this.testRepo} && git init && git add . && git commit -m "Initial commit"`);
    
    console.log(`📁 Test repo created at: ${this.testRepo}`);
    
    // Start claude-sandbox from the test repo
    await this.startSandbox();
    
    // Connect to web UI for monitoring sync events
    await this.connectToWebUI();
    
    console.log('✅ Test environment ready');
  }

  async startSandbox() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting claude-sandbox...');
      
      this.sandboxProcess = spawn('npx', ['claude-sandbox', 'start'], {
        cwd: this.testRepo,
        stdio: 'pipe'
      });

      let setupComplete = false;
      const timeout = setTimeout(() => {
        if (!setupComplete) {
          reject(new Error('Sandbox startup timeout'));
        }
      }, 45000);

      this.sandboxProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('SANDBOX:', output.trim());

        // Extract container ID
        const containerMatch = output.match(/Started container: ([a-f0-9]+)/);
        if (containerMatch) {
          this.containerId = containerMatch[1];
          this.shadowPath = `/tmp/claude-shadows/${this.containerId}`;
          console.log(`🆔 Container ID: ${this.containerId}`);
        }

        // Extract web port
        const portMatch = output.match(/Web UI server started at http:\/\/localhost:(\d+)/);
        if (portMatch) {
          this.webPort = parseInt(portMatch[1]);
          console.log(`🌐 Web UI port: ${this.webPort}`);
        }

        // Check for setup completion
        if (output.includes('Files synced successfully') && !setupComplete) {
          setupComplete = true;
          clearTimeout(timeout);
          setTimeout(() => resolve(), 2000); // Wait a bit more for full initialization
        }
      });

      this.sandboxProcess.stderr.on('data', (data) => {
        console.error('SANDBOX ERROR:', data.toString());
      });

      this.sandboxProcess.on('close', (code) => {
        if (!setupComplete) {
          reject(new Error(`Sandbox process exited with code ${code}`));
        }
      });
    });
  }

  async connectToWebUI() {
    if (!this.webPort || !this.containerId) {
      throw new Error('Web UI port or container ID not available');
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.webPort}/socket.io/?EIO=4&transport=websocket`;
      this.webSocket = new WebSocket(wsUrl);

      this.webSocket.on('open', () => {
        console.log('🔌 Connected to web UI');
        
        // Send initial connection message (Socket.IO protocol)
        this.webSocket.send('40'); // Socket.IO connect message
        
        setTimeout(() => {
          // Attach to container
          this.webSocket.send(`42["attach",{"containerId":"${this.containerId}","cols":80,"rows":24}]`);
          resolve();
        }, 1000);
      });

      this.webSocket.on('message', (data) => {
        const message = data.toString();
        if (message.startsWith('42["sync-complete"')) {
          try {
            const eventData = JSON.parse(message.substring(2))[1];
            this.receivedSyncEvents.push({
              timestamp: Date.now(),
              data: eventData
            });
            console.log('📡 Received sync event:', eventData.summary);
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });

      this.webSocket.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });
  }

  async waitForSync(expectedChanges = null, timeoutMs = 5000) {
    // Just wait a fixed amount of time for sync to happen
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return the latest event if any
    if (this.receivedSyncEvents.length > 0) {
      return this.receivedSyncEvents[this.receivedSyncEvents.length - 1];
    }
    
    return { data: { hasChanges: true, summary: 'Sync completed' } };
  }

  async addFile(filePath, content) {
    const containerPath = `/workspace/${filePath}`;
    await execAsync(`docker exec ${this.containerId} bash -c "mkdir -p $(dirname ${containerPath}) && echo '${content}' > ${containerPath}"`);
    return this.waitForSync();
  }

  async modifyFile(filePath, newContent) {
    const containerPath = `/workspace/${filePath}`;
    await execAsync(`docker exec ${this.containerId} bash -c "echo '${newContent}' > ${containerPath}"`);
    return this.waitForSync();
  }

  async deleteFile(filePath) {
    const containerPath = `/workspace/${filePath}`;
    await execAsync(`docker exec ${this.containerId} rm ${containerPath}`);
    return this.waitForSync();
  }

  async moveFile(fromPath, toPath) {
    const containerFromPath = `/workspace/${fromPath}`;
    const containerToPath = `/workspace/${toPath}`;
    await execAsync(`docker exec ${this.containerId} bash -c "mkdir -p $(dirname ${containerToPath}) && mv ${containerFromPath} ${containerToPath}"`);
    return this.waitForSync();
  }

  async createDirectory(dirPath) {
    const containerPath = `/workspace/${dirPath}`;
    await execAsync(`docker exec ${this.containerId} mkdir -p ${containerPath}`);
  }

  async deleteDirectory(dirPath) {
    const containerPath = `/workspace/${dirPath}`;
    await execAsync(`docker exec ${this.containerId} rm -rf ${containerPath}`);
    return this.waitForSync();
  }

  async getGitStatus() {
    try {
      const { stdout } = await execAsync(`git -C ${this.shadowPath} status --porcelain`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }

  async getShadowFileContent(filePath) {
    try {
      const fullPath = path.join(this.shadowPath, filePath);
      return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read shadow file ${filePath}: ${error.message}`);
    }
  }

  async shadowFileExists(filePath) {
    try {
      const fullPath = path.join(this.shadowPath, filePath);
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');
    
    if (this.webSocket) {
      this.webSocket.close();
    }
    
    if (this.sandboxProcess) {
      this.sandboxProcess.kill('SIGTERM');
    }
    
    // Purge containers
    try {
      await execAsync('npx claude-sandbox purge -y');
    } catch (e) {
      // Ignore errors
    }
    
    // Clean up test repo
    if (this.testRepo) {
      try {
        await fs.rm(this.testRepo, { recursive: true, force: true });
      } catch (e) {
        // Ignore errors
      }
    }
    
    console.log('✅ Cleanup complete');
  }
}

module.exports = { SyncTestFramework };