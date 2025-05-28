#!/usr/bin/env node

const { SyncTestFramework } = require('./sync-test-framework');

class TestRunner {
  constructor() {
    this.framework = new SyncTestFramework();
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runTest(test) {
    const startTime = Date.now();
    try {
      console.log(`\n🧪 Running: ${test.name}`);
      await test.testFn(this.framework);
      const duration = Date.now() - startTime;
      console.log(`✅ PASSED: ${test.name} (${duration}ms)`);
      this.passed++;
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ FAILED: ${test.name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      this.failed++;
      return false;
    }
  }

  async runAll() {
    console.log('🚀 Starting File Sync E2E Tests');
    console.log('='.repeat(50));

    try {
      await this.framework.setup();

      for (const test of this.tests) {
        await this.runTest(test);
      }

    } finally {
      await this.framework.cleanup();
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    
    if (this.failed > 0) {
      console.log('❌ Some tests failed');
      process.exit(1);
    } else {
      console.log('✅ All tests passed!');
      process.exit(0);
    }
  }
}

// Test cases
const runner = new TestRunner();

// Test 1: File Addition
runner.addTest('File Addition', async (framework) => {
  await framework.addFile('new-file.txt', 'Hello, World!');
  
  const exists = await framework.shadowFileExists('new-file.txt');
  if (!exists) {
    throw new Error('File was not synced to shadow repository');
  }
  
  const content = await framework.getShadowFileContent('new-file.txt');
  if (content.trim() !== 'Hello, World!') {
    throw new Error(`Content mismatch: expected "Hello, World!", got "${content.trim()}"`);
  }
  
  const gitStatus = await framework.getGitStatus();
  if (!gitStatus.includes('A  new-file.txt')) {
    throw new Error(`Git status should show addition: ${gitStatus}`);
  }
});

// Test 2: File Modification
runner.addTest('File Modification', async (framework) => {
  // First, create and commit a file
  await framework.addFile('modify-test.txt', 'Original content');
  const { stdout } = await require('util').promisify(require('child_process').exec)(
    `git -C ${framework.shadowPath} add -A && git -C ${framework.shadowPath} commit -m "Add file for modification test"`
  );
  
  // Now modify it
  await framework.modifyFile('modify-test.txt', 'Modified content');
  
  const content = await framework.getShadowFileContent('modify-test.txt');
  if (content.trim() !== 'Modified content') {
    throw new Error(`Content not modified: got "${content.trim()}"`);
  }
  
  const gitStatus = await framework.getGitStatus();
  if (!gitStatus.includes('M  modify-test.txt')) {
    throw new Error(`Git status should show modification: ${gitStatus}`);
  }
});

// Test 3: File Deletion
runner.addTest('File Deletion', async (framework) => {
  // Create and commit a file first
  await framework.addFile('delete-test.txt', 'To be deleted');
  const { stdout } = await require('util').promisify(require('child_process').exec)(
    `git -C ${framework.shadowPath} add -A && git -C ${framework.shadowPath} commit -m "Add file for deletion test"`
  );
  
  // Delete the file
  await framework.deleteFile('delete-test.txt');
  
  const exists = await framework.shadowFileExists('delete-test.txt');
  if (exists) {
    throw new Error('File still exists in shadow repository after deletion');
  }
  
  const gitStatus = await framework.getGitStatus();
  if (!gitStatus.includes('D  delete-test.txt')) {
    throw new Error(`Git status should show deletion: ${gitStatus}`);
  }
});

// Test 4: Multiple File Operations
runner.addTest('Multiple File Operations', async (framework) => {
  // Add multiple files
  await framework.addFile('file1.txt', 'Content 1');
  await framework.addFile('file2.txt', 'Content 2');
  await framework.addFile('file3.txt', 'Content 3');
  
  // Wait for sync
  await framework.waitForSync();
  
  // Check that all files exist
  const exists1 = await framework.shadowFileExists('file1.txt');
  const exists2 = await framework.shadowFileExists('file2.txt');
  const exists3 = await framework.shadowFileExists('file3.txt');
  
  if (!exists1 || !exists2 || !exists3) {
    throw new Error('Not all files were synced to shadow repository');
  }
  
  const gitStatus = await framework.getGitStatus();
  if (!gitStatus.includes('file1.txt') || 
      !gitStatus.includes('file2.txt') || 
      !gitStatus.includes('file3.txt')) {
    throw new Error(`All files should appear in git status: ${gitStatus}`);
  }
});

// Test 5: Directory Operations
runner.addTest('Directory Operations', async (framework) => {
  // Create directory with files
  await framework.createDirectory('new-dir');
  await framework.addFile('new-dir/nested-file.txt', 'Nested content');
  
  const exists = await framework.shadowFileExists('new-dir/nested-file.txt');
  if (!exists) {
    throw new Error('Nested file was not synced');
  }
  
  const content = await framework.getShadowFileContent('new-dir/nested-file.txt');
  if (content.trim() !== 'Nested content') {
    throw new Error(`Nested file content mismatch: got "${content.trim()}"`);
  }
});

// Test 6: File Rename/Move
runner.addTest('File Rename/Move', async (framework) => {
  // Create and commit a file
  await framework.addFile('original-name.txt', 'Content to move');
  const { stdout } = await require('util').promisify(require('child_process').exec)(
    `git -C ${framework.shadowPath} add -A && git -C ${framework.shadowPath} commit -m "Add file for move test"`
  );
  
  // Move the file
  await framework.moveFile('original-name.txt', 'new-name.txt');
  
  const originalExists = await framework.shadowFileExists('original-name.txt');
  const newExists = await framework.shadowFileExists('new-name.txt');
  
  if (originalExists) {
    throw new Error('Original file still exists after move');
  }
  
  if (!newExists) {
    throw new Error('New file does not exist after move');
  }
  
  const content = await framework.getShadowFileContent('new-name.txt');
  if (content.trim() !== 'Content to move') {
    throw new Error(`Moved file content mismatch: got "${content.trim()}"`);
  }
});

// Test 7: Large File Handling
runner.addTest('Large File Handling', async (framework) => {
  const largeContent = 'x'.repeat(10000); // 10KB file
  // Use printf to avoid newline issues with echo
  const containerPath = `/workspace/large-file.txt`;
  await require('util').promisify(require('child_process').exec)(
    `docker exec ${framework.containerId} bash -c "printf '${largeContent}' > ${containerPath}"`
  );
  await framework.waitForSync();
  
  const exists = await framework.shadowFileExists('large-file.txt');
  if (!exists) {
    throw new Error('Large file was not synced');
  }
  
  const content = await framework.getShadowFileContent('large-file.txt');
  if (content.length !== largeContent.length) {
    throw new Error(`Large file size mismatch: expected ${largeContent.length}, got ${content.length}`);
  }
});

// Test 8: Special Characters in Filenames
runner.addTest('Special Characters in Filenames', async (framework) => {
  const specialFile = 'special-chars-test_file.txt';
  await framework.addFile(specialFile, 'Special content');
  
  const exists = await framework.shadowFileExists(specialFile);
  if (!exists) {
    throw new Error('File with special characters was not synced');
  }
  
  const content = await framework.getShadowFileContent(specialFile);
  if (content.trim() !== 'Special content') {
    throw new Error(`Special file content mismatch: got "${content.trim()}"`);
  }
});

// Test 9: Rapid File Changes
runner.addTest('Rapid File Changes', async (framework) => {
  // Create file
  await framework.addFile('rapid-test.txt', 'Version 1');
  
  // Wait for initial sync
  await framework.waitForSync();
  
  // Quickly modify it multiple times
  await framework.modifyFile('rapid-test.txt', 'Version 2');
  await new Promise(resolve => setTimeout(resolve, 200));
  await framework.modifyFile('rapid-test.txt', 'Version 3');
  await new Promise(resolve => setTimeout(resolve, 200));
  await framework.modifyFile('rapid-test.txt', 'Final Version');
  
  // Wait for final sync
  await framework.waitForSync(null, 15000);
  
  const content = await framework.getShadowFileContent('rapid-test.txt');
  if (content.trim() !== 'Final Version') {
    throw new Error(`Final content mismatch: got "${content.trim()}"`);
  }
});

// Test 10: Web UI Sync Notifications
runner.addTest('Web UI Sync Notifications', async (framework) => {
  const initialEventCount = framework.receivedSyncEvents.length;
  
  await framework.addFile('notification-test.txt', 'Test notification');
  
  // Check that we received sync events
  await framework.waitForSync();
  
  const newEventCount = framework.receivedSyncEvents.length;
  if (newEventCount <= initialEventCount) {
    throw new Error('No sync events received by web UI');
  }
  
  const latestEvent = framework.receivedSyncEvents[framework.receivedSyncEvents.length - 1];
  if (!latestEvent.data.hasChanges) {
    throw new Error('Sync event should indicate changes');
  }
  
  if (!latestEvent.data.summary.includes('Added:')) {
    throw new Error(`Sync event should show addition: ${latestEvent.data.summary}`);
  }
});

// Run all tests
runner.runAll().catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});