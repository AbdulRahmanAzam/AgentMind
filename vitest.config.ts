import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.agentmind'],
    environment: 'node',
    timeout: 30000,
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
