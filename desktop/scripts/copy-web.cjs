// Copy the web build (../dist) into ./web so electron-builder can bundle it.
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', '..', 'dist');
const dst = path.join(__dirname, '..', 'web');
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('No web build found in ../dist. Run "npm run build" in the project root first.');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (f) => !f.endsWith('.map') });
console.log(`Copied ${src} -> ${dst}`);
