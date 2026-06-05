import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/e2e/**/*',
      // Real-DB integration tests; require a live MariaDB instance.
      // Run explicitly with: vitest run tests/backend/db-tables.test.ts
      'tests/backend/db-tables.test.ts',
    ],
    environment: 'jsdom',
    setupFiles: 'tests/setupTests.ts',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.{ts}'],
    },
  },
});
