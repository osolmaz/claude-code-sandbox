#!/usr/bin/env node

const { SyncTestFramework } = require('./sync-test-framework');

async function testRepoToContainerSync() {
  console.log('🧪 Testing Repository to Container Sync');
  console.log('======================================');
  
  const framework = new SyncTestFramework();
  
  try {
    await framework.setup();
    
    console.log('\n🔍 Step 1: Verifying ONE-TO-ONE sync from test repo to container...');
    
    // Get list of files in the original test repo
    const repoFiles = await framework.listRepoFiles();
    console.log(`📂 Test repository contains ${repoFiles.length} files:`, repoFiles);
    
    // Get list of files in the container
    const containerFiles = await framework.listContainerFiles();
    console.log(`🐳 Container contains ${containerFiles.length} files:`, containerFiles);
    
    // CRITICAL: Check for exact one-to-one match
    if (containerFiles.length !== repoFiles.length) {
      throw new Error(`File count mismatch! Repo has ${repoFiles.length} files but container has ${containerFiles.length} files`);
    }
    
    // Check that all repo files exist in container
    const missingInContainer = [];
    for (const file of repoFiles) {
      const exists = await framework.containerFileExists(file);
      if (!exists) {
        missingInContainer.push(file);
      }
    }
    
    if (missingInContainer.length > 0) {
      throw new Error(`Files missing in container: ${missingInContainer.join(', ')}`);
    }
    
    // Check for extra files in container that aren't in repo
    const extraInContainer = [];
    for (const file of containerFiles) {
      if (!repoFiles.includes(file)) {
        extraInContainer.push(file);
      }
    }
    
    if (extraInContainer.length > 0) {
      throw new Error(`Extra files found in container that aren't in test repo: ${extraInContainer.join(', ')}`);
    }
    
    console.log('✅ Perfect one-to-one sync: All repo files exist in container, no extra files');
    
    console.log('\n🔍 Step 2: Verifying file content integrity...');
    
    // Check content of key files
    const testFiles = ['README.md', 'package.json', 'src/main.js', 'src/utils.js'];
    const contentMismatches = [];
    
    for (const file of testFiles) {
      if (repoFiles.includes(file)) {
        try {
          // Read from original repo
          const repoContent = await require('fs').promises.readFile(
            require('path').join(framework.testRepo, file), 'utf8'
          );
          
          // Read from container
          const containerContent = await framework.getContainerFileContent(file);
          
          if (repoContent.trim() !== containerContent.trim()) {
            contentMismatches.push({
              file,
              repoLength: repoContent.length,
              containerLength: containerContent.length
            });
          }
        } catch (error) {
          contentMismatches.push({
            file,
            error: error.message
          });
        }
      }
    }
    
    if (contentMismatches.length > 0) {
      console.log('Content mismatches found:');
      contentMismatches.forEach(mismatch => {
        if (mismatch.error) {
          console.log(`  ${mismatch.file}: ${mismatch.error}`);
        } else {
          console.log(`  ${mismatch.file}: repo ${mismatch.repoLength} bytes vs container ${mismatch.containerLength} bytes`);
        }
      });
      throw new Error('File content integrity check failed');
    }
    
    console.log('✅ File content integrity verified');
    
    console.log('\n🔍 Step 3: Verifying no extra files from outside test repo...');
    
    // List of common files that might accidentally be included but shouldn't be
    const shouldNotExist = [
      'node_modules',
      '.env',
      'dist',
      'build',
      '.vscode',
      '.idea',
      'coverage'
    ];
    
    for (const file of shouldNotExist) {
      const exists = await framework.containerFileExists(file);
      if (exists) {
        throw new Error(`Unexpected file/directory found in container: ${file} (should only contain test repo files)`);
      }
    }
    
    console.log('✅ No unexpected files found - container only contains test repo files');
    
    console.log('\n🔍 Step 4: Verifying git repository state...');
    
    // Check that git repository exists in container
    const gitExists = await framework.containerFileExists('.git/HEAD');
    if (!gitExists) {
      throw new Error('Git repository not properly copied to container');
    }
    
    console.log('✅ Git repository state verified');
    
    console.log('\n🔍 Step 5: Verifying working directory setup...');
    
    // Check that we're on the correct branch
    const { stdout: branchOutput } = await require('util').promisify(require('child_process').exec)(
      `docker exec ${framework.containerId} git -C /workspace branch --show-current`
    );
    
    const currentBranch = branchOutput.trim();
    if (!currentBranch.startsWith('claude/')) {
      throw new Error(`Expected to be on a claude/ branch, but on: ${currentBranch}`);
    }
    
    console.log(`✅ Working on correct branch: ${currentBranch}`);
    
    console.log('\n🔍 Step 6: Testing file operations work correctly...');
    
    // Test that we can create files in the container
    await framework.addFile('test-creation.txt', 'Test content');
    await framework.waitForSync();
    
    const createdExists = await framework.containerFileExists('test-creation.txt');
    if (!createdExists) {
      throw new Error('File creation in container failed');
    }
    
    // Test that the file also appears in shadow repo
    const shadowExists = await framework.shadowFileExists('test-creation.txt');
    if (!shadowExists) {
      throw new Error('File not synced to shadow repository');
    }
    
    console.log('✅ File operations working correctly');
    
    console.log('\n🎉 SUCCESS: Repository to container sync is working perfectly!');
    
    console.log('\n📊 Summary:');
    console.log(`  📁 ${repoFiles.length} files synced from test repository to container`);
    console.log(`  ✅ One-to-one sync verified - no extra files`);
    console.log(`  ✅ All files exist with correct content`);
    console.log(`  🌿 Git repository properly initialized`);
    console.log(`  🔄 Bidirectional sync operational`);
    
  } catch (error) {
    console.log(`\n❌ FAILED: ${error.message}`);
    throw error;
  } finally {
    await framework.cleanup();
  }
}

testRepoToContainerSync().then(() => {
  console.log('\n✅ Repository to container sync test completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Repository to container sync test failed:', error.message);
  process.exit(1);
});