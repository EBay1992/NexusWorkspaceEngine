import path from 'node:path';
import { defineConfig } from 'vitest/config';

const pkgs = path.resolve(__dirname, '../../packages');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@orbit/yjs-protocol/ticket': path.join(pkgs, 'yjs-protocol/src/ticket.ts'),
      '@orbit/yjs-protocol': path.join(pkgs, 'yjs-protocol/src/index.ts'),
      '@orbit/shared-types': path.join(pkgs, 'shared-types/src/index.ts'),
    },
  },
});
