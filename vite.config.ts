import { defineConfig } from 'vitest/config';

// `base: './'` keeps asset paths relative so the build works on GitHub Pages
// (served from /<repo-name>/) and when opened from any static host.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  // Some tests run real simulations (GA, Lenia), so allow slower machines and CI runners.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
