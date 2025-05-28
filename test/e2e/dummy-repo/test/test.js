const utils = require('../src/utils');

function runTests() {
  console.log('Running tests...');
  
  // Test calculate function
  const result1 = utils.calculate(2, 3);
  console.assert(result1 === 5, 'Calculate test failed');
  console.log('✓ Calculate test passed');
  
  // Test multiply function
  const result2 = utils.multiply(4, 3);
  console.assert(result2 === 12, 'Multiply test failed');
  console.log('✓ Multiply test passed');
  
  // Test divide function
  const result3 = utils.divide(10, 2);
  console.assert(result3 === 5, 'Divide test failed');
  console.log('✓ Divide test passed');
  
  console.log('All tests passed!');
}

runTests();