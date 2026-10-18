import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vitest/config';

/** Emit sw.js with the list of every built file, so the installed app works offline. */
function serviceWorker(): Plugin {
  return {
    name: 'life-tree-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Browsers that can run this app all read woff2, so the older font formats are left out.
      const files = Object.keys(bundle).filter((f) => !/\.(map|ttf|woff)$/.test(f) && f !== 'index.html');
      files.push('manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png');
      const version = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
        .replace('__PRECACHE__', JSON.stringify(files))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// `base: './'` keeps asset paths relative so the build works on GitHub Pages
// (served from /<repo-name>/), inside the desktop app, and from any static host.
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2022', sourcemap: true },
  // Some tests run real simulations (GA, Lenia), so allow slower machines and CI runners.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
