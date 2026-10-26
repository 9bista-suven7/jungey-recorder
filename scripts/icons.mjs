// Copies one colour SVG per Devicon logo into public/devicon/ (served with the app) plus a
// small search index. Runs before dev/build; skips work when the Devicon version is unchanged.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const src = new URL('node_modules/devicon/', root);
const out = new URL('public/devicon/', root);
const indexFile = new URL('index.json', out);

const { version } = JSON.parse(readFileSync(new URL('package.json', src), 'utf8'));
if (existsSync(indexFile) && JSON.parse(readFileSync(indexFile, 'utf8')).version === version) process.exit(0);

mkdirSync(out, { recursive: true });
const icons = [];
for (const m of JSON.parse(readFileSync(new URL('devicon.json', src), 'utf8'))) {
  const variant = ['original', 'plain', 'line'].find((v) => m.versions.svg.includes(v));
  if (!variant) continue;
  copyFileSync(new URL(`icons/${m.name}/${m.name}-${variant}.svg`, src), new URL(`${m.name}.svg`, out));
  icons.push({ n: m.name, k: [...(m.altnames ?? []), ...(m.tags ?? [])].join(' ') });
}
writeFileSync(indexFile, JSON.stringify({ version, icons }));
console.log(`devicon: ${icons.length} logos copied to public/devicon/`);
