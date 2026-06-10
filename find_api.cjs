const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf-8').split('\n');
lines.forEach((line, i) => {
  if (line.includes('/api/tickets')) {
    console.log(`${i+1}: ${line}`);
  }
});
