const fs = require('fs');
let text = fs.readFileSync('benchmark_cases.json', 'utf8');

const fixed = Buffer.from(text, 'latin1').toString('utf8');

if (fixed.includes('\uFFFD')) {
    console.log('Got replacement characters, fallback to manual replace');
    // manual fallback
    const replacements = {
      'â”€': '─',
      'ðŸŽ¯': '🎯',
      'â€¦': '…',
      'ðŸ”„': '🔄',
      'âœ…': '✅',
      'âœ•': '✖',
      'ðŸš€': '🚀',
      'ðŸ“ˆ': '📈',
      'â€”:': '—:',
      'â€”': '—',
      'ðŸ’¬': '💬'
    };

    let manualText = text;
    for (const [bad, good] of Object.entries(replacements)) {
      manualText = manualText.split(bad).join(good);
    }
    fs.writeFileSync('benchmark_cases.json', manualText, 'utf8');
} else {
    fs.writeFileSync('benchmark_cases.json', fixed, 'utf8');
    console.log('Fixed using Buffer conversion.');
}
