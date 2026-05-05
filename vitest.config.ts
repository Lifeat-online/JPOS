import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: 'tests/setupTests.ts',
    coverage: {
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.{ts,tsx}', 'server/**/*.{ts}'],
    },
    globals: true,
  },
  projects: [
    {
      name: 'frontend',
      test: {
        environment: 'jsdom',
        include: ['tests/frontend/**/*.{test,spec}.{ts,tsx}'],
      },
    },
    {
      name: 'backend',
      test: {
        environment: 'node',
        include: ['tests/backend/**/*.{test,spec}.{ts,tsx}'],
      },
    },
  ],
});
