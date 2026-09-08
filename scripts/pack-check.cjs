const { spawnSync } = require('node:child_process');
const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
if (result.error) throw new Error(`Unable to run npm pack: ${result.error.message}`);
if (result.status !== 0) throw new Error(result.stderr.trim() || `npm pack failed with exit code ${result.status}`);
if (!result.stdout.trim()) throw new Error('npm pack returned no package metadata');

let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch (error) {
  throw new Error(`npm pack returned invalid JSON: ${error.message}`);
}
const pack = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
if (!pack || !Array.isArray(pack.files)) throw new Error('npm pack returned an unexpected metadata shape');

const unwanted = pack.files
  .map((file) => file.path)
  .filter((path) =>
    /^(data\/|\.env|media\/)|(^|\/)\.next\/|\.tsbuildinfo$|^docs\/(HACKATHON_(SUBMISSION|PITCH)|demo-script|RELEASE_(CHECKLIST|STATUS))\.md$/.test(
      path,
    ),
  );
if (unwanted.length) throw new Error(`Package contains runtime/private files: ${unwanted.join(', ')}`);
console.log(`Package check passed (${pack.entryCount} files).`);
