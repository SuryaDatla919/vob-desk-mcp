import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['eval/**/*.test.ts', 'test/**/*.test.ts'],
    // The stdio integration test spawns the real server; give process start-up room on slow machines.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
