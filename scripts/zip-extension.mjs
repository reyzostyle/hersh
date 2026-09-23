// Packs extension/ for the Chrome Web Store. The README and the store/ listing
// assets stay out of the zip: they are for the listing, not for users.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const out = `dist-extension/chumoku-extension-${version}.zip`;
mkdirSync('dist-extension', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', `../${out}`, '.', '-x', 'README.md', '-x', '.*', '-x', 'store/*'], { cwd: 'extension', stdio: 'inherit' });
console.log(`\n${out}`);
