import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 30000,
    setupFiles: ['tests/e2e/setup.ts'],
    fileParallelism: false,
  },
});
