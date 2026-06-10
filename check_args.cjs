const fs = require('fs');

const lines = fs.readFileSync('C:\\Users\\Jimi\\.gemini\\antigravity-ide\\brain\\104102fe-055a-460f-9d2d-1954e64bb76b\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n').filter(Boolean);

for (const line of lines) {
  if (line.includes('"step_index":2527') && line.includes('multi_replace_file_content')) {
    const obj = JSON.parse(line);
    for (const tc of obj.tool_calls) {
      if (tc.name === 'default_api:multi_replace_file_content' && tc.args.TargetFile.includes('server.ts')) {
        console.log(JSON.stringify(tc.args, null, 2));
      }
    }
  }
}
