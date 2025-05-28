#!/usr/bin/env node

const { SyncTestFramework } = require('./sync-test-framework');

async function runCoreTests() {
  console.log('🚀 Core File Sync Functionality Tests');
  console.log('=====================================');
  
  const framework = new SyncTestFramework();
  const tests = [];
  
  try {
    await framework.setup();
    
    // Test 0: Initial Repository Sync
    console.log('\n🧪 Test 0: Initial Repository to Container Sync');
    
    // Verify that repository files are properly synced to container
    const repoFiles = await framework.listRepoFiles();
    const containerFiles = await framework.listContainerFiles();
    
    // Check that key files exist in container
    const expectedFiles = ['README.md', 'package.json', 'src/main.js', 'src/utils.js'];
    for (const file of expectedFiles) {
      const exists = await framework.containerFileExists(file);
      if (!exists) {
        throw new Error(`Expected file ${file} not found in container`);
      }
      
      // Verify content matches
      const repoContent = await require('fs').promises.readFile(
        require('path').join(framework.testRepo, file), 'utf8'
      );
      const containerContent = await framework.getContainerFileContent(file);
      
      if (repoContent.trim() !== containerContent.trim()) {
        throw new Error(`Content mismatch for ${file}`);
      }
    }
    
    console.log('✅ Initial repository sync test passed');
    tests.push({ name: 'Initial Repository Sync', passed: true });
    
    // Test 1: File Addition
    console.log('\n🧪 Test 1: File Addition');
    await framework.addFile('addition-test.txt', 'New file content');
    
    const addExists = await framework.shadowFileExists('addition-test.txt');
    if (!addExists) throw new Error('File addition failed');
    
    const addContent = await framework.getShadowFileContent('addition-test.txt');
    if (addContent.trim() !== 'New file content') throw new Error('File content mismatch');
    
    const addStatus = await framework.getGitStatus();
    if (!addStatus.includes('addition-test.txt')) throw new Error('Git should track new file');
    
    console.log('✅ File addition test passed');
    tests.push({ name: 'File Addition', passed: true });
    
    // Test 2: File Modification
    console.log('\n🧪 Test 2: File Modification');
    // Commit first so we can see modifications
    await require('util').promisify(require('child_process').exec)(
      `git -C ${framework.shadowPath} add -A && git -C ${framework.shadowPath} commit -m "Add files for testing"`
    );
    
    await framework.modifyFile('addition-test.txt', 'Modified content');
    
    const modContent = await framework.getShadowFileContent('addition-test.txt');
    if (modContent.trim() !== 'Modified content') throw new Error('File modification failed');
    
    const modStatus = await framework.getGitStatus();
    if (!modStatus.includes('M  addition-test.txt')) throw new Error('Git should track modification');
    
    console.log('✅ File modification test passed');
    tests.push({ name: 'File Modification', passed: true });
    
    // Test 3: File Deletion
    console.log('\n🧪 Test 3: File Deletion');
    await framework.deleteFile('addition-test.txt');
    
    const delExists = await framework.shadowFileExists('addition-test.txt');
    if (delExists) throw new Error('File deletion failed - file still exists');
    
    const delStatus = await framework.getGitStatus();
    if (!delStatus.includes('D  addition-test.txt')) throw new Error('Git should track deletion');
    
    console.log('✅ File deletion test passed');
    tests.push({ name: 'File Deletion', passed: true });
    
    // Test 4: Directory Operations
    console.log('\n🧪 Test 4: Directory Operations');
    await framework.createDirectory('test-dir');
    await framework.addFile('test-dir/nested-file.txt', 'Nested content');
    
    const nestedExists = await framework.shadowFileExists('test-dir/nested-file.txt');
    if (!nestedExists) throw new Error('Nested file creation failed');
    
    const nestedContent = await framework.getShadowFileContent('test-dir/nested-file.txt');
    if (nestedContent.trim() !== 'Nested content') throw new Error('Nested file content mismatch');
    
    console.log('✅ Directory operations test passed');
    tests.push({ name: 'Directory Operations', passed: true });
    
    // Test 5: Web UI Notifications
    console.log('\n🧪 Test 5: Web UI Notifications');
    const initialEventCount = framework.receivedSyncEvents.length;
    
    await framework.addFile('notification-test.txt', 'Notification content');
    await framework.waitForSync();
    
    const finalEventCount = framework.receivedSyncEvents.length;
    if (finalEventCount <= initialEventCount) throw new Error('No sync events received');
    
    const latestEvent = framework.receivedSyncEvents[framework.receivedSyncEvents.length - 1];
    if (!latestEvent.data.hasChanges) throw new Error('Sync event should indicate changes');
    
    console.log('✅ Web UI notifications test passed');
    tests.push({ name: 'Web UI Notifications', passed: true });
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    tests.push({ name: 'Current Test', passed: false, error: error.message });
  } finally {
    await framework.cleanup();
  }
  
  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  
  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;
  
  tests.forEach(test => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${test.name}`);
    if (!test.passed && test.error) {
      console.log(`   ${test.error}`);
    }
  });
  
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All core functionality tests passed!');
    return true;
  } else {
    console.log('❌ Some tests failed');
    return false;
  }
}

runCoreTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});