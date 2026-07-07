import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@orbit/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@orbit/yjs-protocol': path.resolve(__dirname, '../../packages/yjs-protocol/src/index.ts'),
    },
  },
});
