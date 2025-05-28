# Claude Code Sandbox Tests

This directory contains tests for the Claude Code Sandbox project.

## Test Structure

- `unit/` - Unit tests for individual components
- `integration/` - Integration tests for testing multiple components together
- `e2e/` - End-to-end tests for testing full workflows

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test test/unit/container.test.js
```

## Writing Tests

Tests should be written using a testing framework like Jest or Mocha. Each test file should be self-contained and test a specific component or feature.
