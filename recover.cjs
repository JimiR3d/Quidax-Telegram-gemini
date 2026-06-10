const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:\\Users\\Jimi\\.gemini\\antigravity-ide\\brain\\104102fe-055a-460f-9d2d-1954e64bb76b\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const lines = new Map();

  for await (const line of rl) {
    if (line.includes('server.ts') && line.includes('File Path: ') && line.includes('The following code has been modified')) {
      try {
        const obj = JSON.parse(line);
        if (obj.content && obj.content.includes('server.ts')) {
           const blocks = obj.content.split('\n');
           let inCode = false;
           for (const l of blocks) {
             if (l.includes('The following code has been modified')) {
                inCode = true;
                continue;
             }
             if (l.includes('The above content does NOT show the entire file')) {
                inCode = false;
             }
             if (inCode) {
               const match = l.match(/^(\d+): (.*)$/);
               if (match) {
                  lines.set(parseInt(match[1], 10), match[2]);
               }
             }
           }
        }
      } catch(e) {}
    }
  }
  
  const sortedKeys = Array.from(lines.keys()).sort((a,b) => a-b);
  let missing = 0;
  for (let i = 1; i <= Math.max(...sortedKeys); i++) {
     if (!lines.has(i)) missing++;
  }
  console.log(`Recovered ${lines.size} lines. Missing: ${missing}`);

  const out = [];
  for (let i = 1; i <= Math.max(...sortedKeys); i++) {
     out.push(lines.has(i) ? lines.get(i) : `// MISSING LINE ${i}`);
  }
  fs.writeFileSync('C:\\Users\\Jimi\\Downloads\\The Anti-Gravity\\Quidax Telegram\\server.ts.recovered2', out.join('\n'));
}
extract();
