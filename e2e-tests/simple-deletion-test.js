#!/usr/bin/env node

const { SyncTestFramework } = require('./sync-test-framework');

async function testDeletionFunctionality() {
  console.log('🧪 Testing File Deletion Functionality');
  console.log('=====================================');
  
  const framework = new SyncTestFramework();
  
  try {
    // Setup
    await framework.setup();
    
    console.log('\n📝 Step 1: Adding test files...');
    await framework.addFile('test1.txt', 'Content 1');
    await framework.addFile('test2.txt', 'Content 2');
    await framework.addFile('test3.txt', 'Content 3');
    await framework.waitForSync();
    
    // Commit the files so deletions can be tracked
    const { stdout } = await require('util').promisify(require('child_process').exec)(
      `git -C ${framework.shadowPath} add -A && git -C ${framework.shadowPath} commit -m "Add test files"`
    );
    console.log('✅ Files committed to git');
    
    console.log('\n🗑️ Step 2: Deleting one file...');
    await framework.deleteFile('test2.txt');
    await framework.waitForSync();
    
    console.log('\n🔍 Step 3: Verifying deletion...');
    
    // Check that file no longer exists in shadow repo
    const exists = await framework.shadowFileExists('test2.txt');
    if (exists) {
      throw new Error('❌ File still exists in shadow repository');
    }
    console.log('✅ File removed from shadow repository');
    
    // Check git status shows deletion
    const gitStatus = await framework.getGitStatus();
    console.log('Git status:', gitStatus);
    
    if (!gitStatus.includes('D  test2.txt')) {
      throw new Error(`❌ Git status should show deletion: ${gitStatus}`);
    }
    console.log('✅ Git properly tracks deletion');
    
    // Check other files still exist
    const exists1 = await framework.shadowFileExists('test1.txt');
    const exists3 = await framework.shadowFileExists('test3.txt');
    
    if (!exists1 || !exists3) {
      throw new Error('❌ Other files were incorrectly deleted');
    }
    console.log('✅ Other files preserved');
    
    console.log('\n🎉 SUCCESS: File deletion tracking is working correctly!');
    
  } catch (error) {
    console.log(`\n❌ FAILED: ${error.message}`);
    throw error;
  } finally {
    await framework.cleanup();
  }
}

testDeletionFunctionality().then(() => {
  console.log('\n✅ Deletion test completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Deletion test failed:', error.message);
  process.exit(1);
});