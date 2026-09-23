// Renders the Chrome Web Store screenshots (1280x800) and the small promo tile
// (440x280) from extension/store/*.html with headless Chrome, into
// extension/store/out. Run after changing the copy or the look.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = resolve('extension/store');
mkdirSync(`${dir}/out`, { recursive: true });

const shots = [
  ...[1, 2, 3, 4, 5].map(n => ({ src: `shot-${n}.html`, out: `screenshot-${n}.png`, size: '1280,800' })),
  { src: 'promo.html', out: 'promo-440x280.png', size: '440,280' },
];
for (const s of shots) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${s.size}`, '--virtual-time-budget=4000',
    `--screenshot=${dir}/out/${s.out}`, `file://${dir}/${s.src}`,
  ], { stdio: 'ignore' });
  console.log(`extension/store/out/${s.out}`);
}
