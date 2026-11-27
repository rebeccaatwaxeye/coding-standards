import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['lib/**/*.mjs'],
      exclude: ['lib/**/*.test.mjs'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
})
