import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 60_000,
          // Browser-heavy tests: run serially to keep memory bounded.
          fileParallelism: false,
        },
      },
    ],
  },
});
