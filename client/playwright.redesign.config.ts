import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: ['redesign.spec.ts', 'calendar-day.spec.ts', 'refinements.spec.ts'], workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5176', reducedMotion: 'reduce', colorScheme: 'dark',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] } : {} },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5176 --strictPort', url: 'http://127.0.0.1:5176/e2e/fixtures/redesign.html', reuseExistingServer: !process.env.CI },
})
