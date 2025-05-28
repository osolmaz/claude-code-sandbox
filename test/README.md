# Test Directory Structure

This directory contains all tests for the Claude Code Sandbox project.

## Directory Layout

```
test/
├── unit/              # Unit tests for individual modules
├── integration/       # Integration tests for module interactions
├── e2e/              # End-to-end tests for full workflow scenarios
├── fixtures/         # Test data, mock responses, sample files
└── helpers/          # Shared test utilities and helpers
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

## Test Naming Conventions

- Unit tests: `*.test.ts` or `*.spec.ts`
- Test files should mirror the source structure
  - Example: `test/unit/container.test.ts` tests `src/container.ts`

## Writing Tests

Tests are written using Jest with TypeScript support. The Jest configuration is in `jest.config.js` at the project root.

### Example Unit Test

```typescript
import { someFunction } from '../../src/someModule';

describe('someFunction', () => {
  it('should do something', () => {
    const result = someFunction('input');
    expect(result).toBe('expected output');
  });
});
```

## E2E Tests

End-to-end tests are located in `test/e2e/` and test the complete workflow of the CLI tool. These tests:
- Create actual Docker containers
- Run Claude commands
- Verify git operations
- Test the full user experience

Run E2E tests with: `npm run test:e2e`