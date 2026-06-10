const fs = require('fs');

async function reconstruct() {
  const lines = fs.readFileSync('server_ts_history.jsonl', 'utf8').split('\n').filter(Boolean);
  
  // Start with the original server.ts (current HEAD is 617 lines)
  // Wait! Did I checkout HEAD? Yes.
  let content = fs.readFileSync('C:\\Users\\Jimi\\Downloads\\The Anti-Gravity\\Quidax Telegram\\server.ts', 'utf8');

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'default_api:multi_replace_file_content' || tc.name === 'default_api:replace_file_content') {
            const args = tc.args;
            if (args && args.TargetFile && args.TargetFile.includes('server.ts')) {
              // Apply replacement
              if (tc.name === 'default_api:replace_file_content') {
                 if (content.includes(args.TargetContent)) {
                    content = content.replace(args.TargetContent, args.ReplacementContent);
                    console.log(`[Step ${i}] replace_file_content SUCCESS`);
                 } else {
                    console.log(`[Step ${i}] replace_file_content FAILED`);
                 }
              } else if (tc.name === 'default_api:multi_replace_file_content') {
                 for (const chunk of args.ReplacementChunks) {
                    if (content.includes(chunk.TargetContent)) {
                       content = content.replace(chunk.TargetContent, chunk.ReplacementContent);
                       console.log(`[Step ${i}] chunk SUCCESS`);
                    } else {
                       console.log(`[Step ${i}] chunk FAILED (maybe already applied or mismatch)`);
                    }
                 }
              }
            }
          }
        }
      }
    } catch(e) {}
  }

  fs.writeFileSync('C:\\Users\\Jimi\\Downloads\\The Anti-Gravity\\Quidax Telegram\\server.ts.reconstructed', content);
  console.log('Reconstruction done. Length:', content.length);
}
reconstruct();
