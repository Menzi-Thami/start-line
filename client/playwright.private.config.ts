import { defineConfig } from '@playwright/test'

// Requires STARTLINE_TEST_SQL for a disposable local database. No mocked API routes.
export default defineConfig({
  testDir: './persisted-e2e', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5178', reducedMotion: 'reduce', timezoneId: 'UTC',
    extraHTTPHeaders: { 'X-Test-User': 'synthetic-private-browser-owner' },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] } : {},
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'dotnet run --project ../tests/StartLine.PrivatePlan.BrowserHost -c Release', url: 'http://127.0.0.1:5142/health/live', timeout: 240_000 },
    { command: 'npx vite --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178/e2e/fixtures/private-prescription.html', env: { VITE_API_BASE_URL: 'http://127.0.0.1:5142' } },
  ],
})
