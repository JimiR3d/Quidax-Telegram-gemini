const fs = require('fs');

const lines = fs.readFileSync('server_ts_history.jsonl', 'utf8').split('\n').filter(Boolean);
for (let i = 0; i < lines.length; i++) {
  try {
    const obj = JSON.parse(lines[i]);
    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name === 'default_api:write_to_file' && tc.args && tc.args.TargetFile && tc.args.TargetFile.includes('server.ts')) {
           console.log(`Step ${i}: write_to_file length: ${tc.args.CodeContent ? tc.args.CodeContent.length : 0}`);
        }
      }
    }
  } catch(e) {}
}
