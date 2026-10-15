import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // CLI 시험은 프로세스를 띄운다
    testTimeout: 30_000,
  },
});
