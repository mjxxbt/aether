const { spawnSync } = require('node:child_process');
const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'npm pack failed');
const parsed = JSON.parse(result.stdout);
const pack = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
const unwanted = pack.files.map(f => f.path).filter(p => /^(data\/|\.env)|(^|\/)\.next\/|\.tsbuildinfo$/.test(p));
if (unwanted.length) throw new Error(`Package contains runtime/private files: ${unwanted.join(', ')}`);
console.log(`Package check passed (${pack.entryCount} files).`);
