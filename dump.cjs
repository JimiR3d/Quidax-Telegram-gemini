const fs = require('fs');
const readline = require('readline');

async function dump() {
  const fileStream = fs.createReadStream('C:\\Users\\Jimi\\.gemini\\antigravity-ide\\brain\\104102fe-055a-460f-9d2d-1954e64bb76b\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const out = [];
  for await (const line of rl) {
    if (line.includes('server.ts') && (line.includes('write_to_file') || line.includes('multi_replace') || line.includes('replace_file_content'))) {
       out.push(line);
    }
  }
  
  fs.writeFileSync('C:\\Users\\Jimi\\Downloads\\The Anti-Gravity\\Quidax Telegram\\server_ts_history.jsonl', out.join('\n'));
}
dump();
