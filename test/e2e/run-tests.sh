#!/bin/bash

# E2E Test Runner for Claude Sandbox File Sync
# This script runs end-to-end tests to verify file synchronization functionality

set -e

echo "🚀 Claude Sandbox E2E Test Suite"
echo "================================="

# Check dependencies
echo "🔍 Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ npx is required but not installed"
    exit 1
fi

echo "✅ Dependencies OK"

# Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
npx claude-sandbox purge -y || echo "No containers to clean up"

# Run repository to container sync test
echo "🧪 Running repository to container sync test..."
cd "$(dirname "$0")"

if node repo-to-container-sync-test.js; then
    echo "✅ Repository to container sync test passed"
else
    echo "❌ Repository to container sync test failed"
    exit 1
fi

# Run core functionality tests
echo "🧪 Running core functionality tests..."

if node core-functionality-test.js; then
    echo "✅ Core functionality tests passed"
else
    echo "❌ Core functionality tests failed"
    exit 1
fi

# Clean up after tests
echo "🧹 Final cleanup..."
npx claude-sandbox purge -y || echo "No containers to clean up"

echo "🎉 All tests completed successfully!"
echo ""
echo "📝 Available tests:"
echo "  - node repo-to-container-sync-test.js  (Verify one-to-one repo sync)"
echo "  - node core-functionality-test.js      (Core file sync functionality)"
echo "  - node simple-deletion-test.js         (Focused deletion test)"
echo "  - node test-suite.js                   (Full comprehensive test suite)"
echo ""
echo "✅ File synchronization functionality is working correctly!"