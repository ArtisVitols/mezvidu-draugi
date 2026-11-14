#!/usr/bin/env node
// Lietošana: node tools/bump-version.mjs 1.4.0
// Ieraksta versiju js/version.js un pievieno ?v=<versija> visiem iekšējiem importiem un
// index.html saitēm, lai telefoni pēc publicēšanas noteikti ielādē jaunos failus (nevis kešu).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage: node tools/bump-version.mjs X.Y.Z'); process.exit(1); }
const date = new Date().toISOString().slice(0, 10);

const verFile = join(root, 'js/version.js');
writeFileSync(verFile, readFileSync(verFile, 'utf8')
  .replace(/VERSION = '[^']*'/, `VERSION = '${v}'`)
  .replace(/BUILD_DATE = '[^']*'/, `BUILD_DATE = '${date}'`));

// visi relatīvie importi: from './x.js' vai './x.js?v=...'
for (const f of readdirSync(join(root, 'js')).filter((n) => n.endsWith('.js'))) {
  const p = join(root, 'js', f);
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/(from\s+'\.\/[\w-]+\.js)(\?v=[\w.]+)?'/g, `$1?v=${v}'`);
  if (out !== src) writeFileSync(p, out);
}
const idx = join(root, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8')
  .replace(/(src="js\/main\.js)(\?v=[\w.]+)?"/, `$1?v=${v}"`)
  .replace(/(href="css\/style\.css)(\?v=[\w.]+)?"/, `$1?v=${v}"`)
  .replace(/(<meta name="app-version" content=")[^"]*"/, `$1${v}"`));
console.log(`Version ${v} (${date})`);
