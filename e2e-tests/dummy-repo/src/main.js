const utils = require('./utils');

function main() {
  console.log('Starting test application...');
  const result = utils.calculate(10, 5);
  console.log('Calculation result:', result);
  console.log('Application finished.');
}

if (require.main === module) {
  main();
}

module.exports = { main };