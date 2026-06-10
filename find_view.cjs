const fs = require('fs');

const lines = fs.readFileSync('C:\\Users\\Jimi\\.gemini\\antigravity-ide\\brain\\104102fe-055a-460f-9d2d-1954e64bb76b\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n').filter(Boolean);

let longestView = '';

for (let i = 0; i < lines.length; i++) {
  try {
    const obj = JSON.parse(lines[i]);
    if (obj.type === 'ACTION_RESULT' && obj.content && obj.content.includes('server.ts') && obj.content.includes('import express')) {
      if (obj.content.length > longestView.length) {
        longestView = obj.content;
      }
    }
  } catch(e) {}
}

if (longestView) {
  fs.writeFileSync('server_longest_view.txt', longestView);
  console.log('Saved longest view, length:', longestView.length);
} else {
  console.log('No view_file output found for server.ts');
}
