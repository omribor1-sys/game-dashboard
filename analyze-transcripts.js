const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Omri\\.claude\\projects\\C--Users-Omri';
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, 15)
  .map(f => path.join(dir, f.name));

const counts = {};

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant' || !obj.message?.content) continue;
      for (const item of obj.message.content) {
        if (item.type !== 'tool_use') continue;
        if (item.name === 'Bash' && item.input?.command) {
          const cmd = item.input.command.replace(/^\s*\w+=\S+\s+/, '').trim();
          const tokens = cmd.split(/\s+/).filter(Boolean);
          const key = tokens.length >= 2 ? tokens[0] + ' ' + tokens[1] : tokens[0] || '';
          if (key) counts[key] = (counts[key] || 0) + 1;
        } else if (item.name && item.name.startsWith('mcp__')) {
          counts[item.name] = (counts[item.name] || 0) + 1;
        }
      }
    } catch {}
  }
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
for (const [k, v] of sorted) console.log(v, '\t', k);
