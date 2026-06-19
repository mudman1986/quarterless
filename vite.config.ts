import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site under /<repo>/, so the base path must match
// the repository name. Change this if you rename the repository.
const BASE_PATH = '/sindicate/';

export default defineConfig({
  base: BASE_PATH,
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Phaser is a large single dependency; this keeps the build log clean
    // without hiding genuinely oversized app chunks.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    // Unit tests live next to the pure game logic in src/. E2E tests live in e2e/
    // and are run by Playwright, so they are excluded here.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only the framework-agnostic game logic is held to the coverage gate.
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
