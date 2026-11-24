import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import connections from './playwright.connections.config'

// Focused whole-screen release checks use the real App with synthetic APIs only.
// The normal e2e command still runs these alongside the real stateless API journeys.
export default defineConfig({
  ...base,
  testMatch: ['release-regression.spec.ts', 'account-loading-recovery.spec.ts'],
  projects: [...base.projects!.filter(project => project.name === 'desktop'), ...connections.projects!],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176/e2e/fixtures/journey.html',
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:5176' },
    reuseExistingServer: !process.env.CI,
  },
})
