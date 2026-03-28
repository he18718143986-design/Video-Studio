import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**/*.ts', 'services/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.d.ts'],
      thresholds: {
        statements: 8,
        branches: 8,
        functions: 7,
        lines: 8,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/mocks/server-only.ts'),
    },
  },
});
