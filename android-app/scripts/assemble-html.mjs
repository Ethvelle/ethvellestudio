import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const partsDir = path.join(root, 'source-v398');
const names = (await fs.readdir(partsDir)).filter(n => /^part-\d{3}\.txt$/.test(n)).sort();
if (names.length !== 74) throw new Error(`Expected 74 v398 source chunks, found ${names.length}`);

let html = '';
for (let i = 0; i < names.length; i++) {
  const expected = `part-${String(i + 1).padStart(3, '0')}.txt`;
  if (names[i] !== expected) throw new Error(`Missing or out-of-order source part: expected ${expected}, got ${names[i]}`);
  html += await fs.readFile(path.join(partsDir, names[i]), 'utf8');
}
if (!/^\s*<!doctype html/i.test(html) || !/<\/html>\s*$/i.test(html)) {
  throw new Error('The concatenated v398 source does not look like a complete HTML document.');
}

const bootstrap = await fs.readFile(path.join(root, 'src', 'native-bootstrap.js'), 'utf8');
const injection = `\n<!-- Ethvelle Android-only bootstrap; skipped completely in normal browsers. -->\n<script id="ethvelle-native-bootstrap">\n${bootstrap}\n</script>\n<script src="./native-runtime.js"></script>\n`;
html = html.replace(/<head\b[^>]*>/i, match => match + injection);
const out = path.join(root, 'www');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'index.html'), html, 'utf8');
console.log(`Created www/index.html from ${names.length} ordered v398 chunks (${Buffer.byteLength(html)} bytes).`);
