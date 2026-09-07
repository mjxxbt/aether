const fs = require('node:fs');
for (const file of ['package-lock.json', 'web/package-lock.json']) {
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!lock.lockfileVersion || !lock.packages) throw new Error(`${file} is not a valid npm lockfile`);
}
console.log('Offline dependency metadata check passed. Run npm audit with registry access for advisory data.');
