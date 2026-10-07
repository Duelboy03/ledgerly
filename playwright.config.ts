import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', channel: 'chrome', viewport: { width: 1360, height: 860 } },
  webServer: {
    command: 'VITE_API_MODE=local npm run build -w @ledgerly/web && npm exec -w @ledgerly/web -- vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
