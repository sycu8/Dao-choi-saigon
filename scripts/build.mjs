import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const html = readFileSync('index.html', 'utf8');
const sources = readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('src', f), 'utf8'));
const all = [html, ...sources].join('\n');
for (const text of ['Tesla Roadster Rocket', 'Mercedes GLC 200', 'VinFast VF8 Plus', 'Ninja Lead', 'Ninja xe Lead', 'setWeather', 'toggleFly']) {
  if (!all.includes(text)) throw new Error(`Missing feature: ${text}`);
}

const importMap = html.match(/<script type="importmap">[\s\S]*?<\/script>\s*/);
const entry = html.match(/<script type="module" src="\.\/src\/main\.js"><\/script>/);
if (!entry) throw new Error('Game entry script (./src/main.js) not found in index.html');

mkdirSync('public', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022'],
  outfile: 'public/game.js',
});
let out = html.replace(entry[0], '<script type="module" src="/game.js"></script>');
if (importMap) out = out.replace(importMap[0], '');
out = out.replace(/<!-- Dev only:[\s\S]*?-->\s*/, '');
writeFileSync('public/index.html', out);
console.log('Built fully self-hosted assets (including Three.js) in public/');
