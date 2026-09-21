const { execSync } = require('child_process');
console.log('== PusoPay demo tests ==');
execSync('node tests/test-auth.js', { stdio: 'inherit' });
console.log('== done ==');
