import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: the real API and a production build of the client, driven
// through a real browser. CI installs Playwright's Chromium; locally, set
// PW_CHANNEL=msedge to use the Edge already on the machine instead.
const api = 'http://localhost:5122'
const web = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: web,
    channel: process.env.PW_CHANNEL,
    // The starting-gun intro is tested on its own; everywhere else it would only sit in front of the page.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
  webServer: [
    {
      // A non-Development environment skips the startup migration, so no database is needed:
      // building and sharing plans is stateless, and accounts stay off without sign-in settings.
      command: `dotnet run --project ../src/StartLine.API -c Release -p:UseAppHost=false --no-launch-profile --urls ${api}`,
      url: `${api}/health/live`,
      env: {
        ASPNETCORE_ENVIRONMENT: 'E2E',
        Cors__AllowedOrigins__0: web,
        ConnectionStrings__StartLine: 'Server=127.0.0.1,1;Database=Unused;User Id=e2e;Password=unused;TrustServerCertificate=True',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: 'npm run build && npx vite preview --port 5173 --strictPort',
      url: web,
      env: { VITE_API_BASE_URL: api },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
})
