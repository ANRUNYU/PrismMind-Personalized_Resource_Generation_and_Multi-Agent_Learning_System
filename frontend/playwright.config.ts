import { defineConfig, devices } from '@playwright/test'

const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    headless: process.env.PLAYWRIGHT_HEADED !== '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: channel || 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(channel ? { channel } : {})
      }
    }
  ]
})
