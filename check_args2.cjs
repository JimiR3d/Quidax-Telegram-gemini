const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\Jimi\\.gemini\\antigravity-ide\\brain\\104102fe-055a-460f-9d2d-1954e64bb76b\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n').filter(Boolean);
for (const line of lines) {
  if (line.includes('"step_index":2527')) {
    const obj = JSON.parse(line);
    if (obj.tool_calls) {
      console.log(JSON.stringify(obj.tool_calls, null, 2));
    }
  }
}
