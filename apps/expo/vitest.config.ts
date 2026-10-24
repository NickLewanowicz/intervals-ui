import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    // @intervals/core ships TS source; test it directly (no build step).
    alias: {
      '@intervals/core': resolve(root, '../../packages/core/src/index.ts'),
      '@': resolve(root, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
