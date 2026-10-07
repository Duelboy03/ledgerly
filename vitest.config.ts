import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: { provider: 'v8', include: ['packages/*/src/**', 'apps/web/src/lib/**'], exclude: ['**/*.test.*', '**/index.ts', '**/testkit.ts', '**/main.ts', '**/pg.ts'] },
  },
})
