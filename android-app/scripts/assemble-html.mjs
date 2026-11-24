import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'source-v404');
const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
const names = (await fs.readdir(sourceDir)).filter(name => /^part-\d{3}\.txt$/.test(name)).sort();

if (names.length !== manifest.parts) throw new Error(`Expected ${manifest.parts} v404 source parts, found ${names.length}`);
let html = '';
for (let i = 0; i < manifest.parts; i++) {
  const expected = `part-${String(i + 1).padStart(3, '0')}.txt`;
  if (names[i] !== expected) throw new Error(`Missing or out-of-order v404 source part: expected ${expected}, got ${names[i]}`);
  html += await fs.readFile(path.join(sourceDir, names[i]), 'utf8');
}
if (!/^\s*<!doctype html/i.test(html) || !/<\/html>\s*$/i.test(html)) throw new Error('The reconstructed v404 source is not a complete HTML document.');
const byteLength = Buffer.byteLength(html, 'utf8');
const digest = createHash('sha256').update(html, 'utf8').digest('hex');
if (byteLength !== manifest.sourceBytes || digest !== manifest.sha256) throw new Error(`v404 source integrity check failed (bytes=${byteLength}, sha256=${digest}).`);

const bootstrap = await fs.readFile(path.join(root, 'src', 'native-bootstrap.js'), 'utf8');
const injection = `
<!-- Ethvelle Android-only bootstrap; skipped completely in normal browsers. -->
<script id="ethvelle-native-bootstrap">
${bootstrap}
</script>
<script src="./native-runtime.js"></script>
`;
html = html.replace(/<head\b[^>]*>/i, match => match + injection);
const out = path.join(root, 'www');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'index.html'), html, 'utf8');
console.log(`Created www/index.html from the exact v404 source (${manifest.sourceBytes} source bytes, sha256 ${manifest.sha256}); native bridge injected only in the Android build output.`);
