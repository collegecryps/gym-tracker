import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5180' },
  projects: [
    { name: 'iphone-safari', use: { ...devices['iPhone 14'] } },
    { name: 'iphone-chrome', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
  ],
  webServer: { command: 'npx vite --port 5180 --strictPort', url: 'http://localhost:5180', reuseExistingServer: true },
})
