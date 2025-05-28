# Claude Sandbox E2E Tests

This directory contains end-to-end tests for the Claude Sandbox file synchronization functionality. These tests verify that file operations (create, modify, delete) are properly synced between the container and the shadow repository, and that the web UI receives appropriate notifications.

## Overview

The tests create a temporary git repository, start a claude-sandbox instance, perform file operations inside the container, and verify that:

1. Files are properly synced to the shadow repository
2. Git properly tracks additions, modifications, and deletions
3. The web UI receives sync notifications
4. File content is accurately preserved

## Test Structure

### Core Components

- **`sync-test-framework.js`** - Main testing framework that manages sandbox lifecycle
- **`dummy-repo/`** - Template files for creating test repositories
- **`repo-to-container-sync-test.js`** - Verifies one-to-one sync from repo to container
- **`core-functionality-test.js`** - Essential functionality tests (recommended)
- **`simple-deletion-test.js`** - Focused test for deletion tracking
- **`test-suite.js`** - Comprehensive test suite with all scenarios
- **`run-tests.sh`** - Shell script for automated test execution

### Test Categories

1. **Repository to Container Sync** - Verifying one-to-one sync from local repo to container
2. **File Addition** - Creating new files and verifying sync
3. **File Modification** - Modifying existing files and tracking changes
4. **File Deletion** - Deleting files and ensuring proper removal
5. **Directory Operations** - Creating nested directories and files
6. **Web UI Notifications** - Verifying real-time sync events

## Running Tests

### Quick Test (Recommended)
```bash
# Run core functionality tests
node core-functionality-test.js
```

### Individual Tests
```bash
# Test repository to container sync
node repo-to-container-sync-test.js

# Test deletion functionality specifically
node simple-deletion-test.js

# Run comprehensive test suite
node test-suite.js
```

### Automated Test Runner
```bash
# Run all tests with cleanup
./run-tests.sh
```

## Prerequisites

- Node.js (for running test scripts)
- Docker (for claude-sandbox containers)
- Built claude-sandbox project (`npm run build`)

## Test Process

1. **Setup Phase**
   - Creates temporary git repository with dummy files
   - Starts claude-sandbox instance
   - Connects to web UI for monitoring sync events

2. **Test Execution**
   - Performs file operations inside the container
   - Waits for synchronization to complete
   - Verifies shadow repository state
   - Checks git status and file content

3. **Cleanup Phase**
   - Terminates sandbox processes
   - Removes containers and temporary files

## Key Features Tested

### Repository to Container Sync
- ✅ One-to-one file mapping from test repo to container
- ✅ No extra files in container (only test repo files)
- ✅ File content integrity verification
- ✅ Git repository properly initialized
- ✅ Correct branch creation

### File Synchronization
- ✅ New file creation and content sync
- ✅ File modification and content updates
- ✅ File deletion and proper removal
- ✅ Directory creation and nested files
- ✅ Large file handling
- ✅ Special characters in filenames

### Git Integration
- ✅ Staging of additions (`A` status)
- ✅ Tracking of modifications (`M` status)
- ✅ Detection of deletions (`D` status)
- ✅ Proper git commit workflow

### Web UI Integration
- ✅ Real-time sync event notifications
- ✅ Change summary reporting
- ✅ WebSocket communication

## Troubleshooting

### Common Issues

**Container startup timeout**
- Increase timeout values in test framework
- Check Docker daemon is running
- Verify claude-sandbox image exists

**Git lock conflicts**
- Tests automatically handle concurrent git operations
- Temporary `.git/index.lock` files are cleaned up

**Port conflicts**
- Tests use dynamic port allocation
- Multiple tests can run sequentially

**WebSocket connection issues**
- Framework includes connection retry logic
- Fallback to polling if WebSocket fails

### Test Failure Analysis

Tests provide detailed error messages indicating:
- Which specific operation failed
- Expected vs actual file states
- Git status differences
- Sync event discrepancies

## Development

### Adding New Tests

1. Create test function in appropriate test file
2. Use framework methods for file operations:
   ```javascript
   await framework.addFile('path/file.txt', 'content');
   await framework.modifyFile('path/file.txt', 'new content');
   await framework.deleteFile('path/file.txt');
   ```
3. Verify results using assertion methods:
   ```javascript
   const exists = await framework.shadowFileExists('file.txt');
   const content = await framework.getShadowFileContent('file.txt');
   const gitStatus = await framework.getGitStatus();
   ```

### Framework API

**File Operations**
- `addFile(path, content)` - Create new file
- `modifyFile(path, content)` - Update existing file  
- `deleteFile(path)` - Remove file
- `moveFile(from, to)` - Rename/move file
- `createDirectory(path)` - Create directory

**Verification Methods**
- `shadowFileExists(path)` - Check file existence
- `getShadowFileContent(path)` - Read file content
- `getGitStatus()` - Get git status output
- `waitForSync()` - Wait for synchronization

**Event Monitoring**
- `receivedSyncEvents` - Array of sync notifications
- WebSocket connection automatically established

## Integration with CI/CD

These tests are designed to run in automated environments:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    npm run build
    cd e2e-tests
    ./run-tests.sh
```

The tests provide proper exit codes (0 for success, 1 for failure) and detailed logging for debugging purposes.