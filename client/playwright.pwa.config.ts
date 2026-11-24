import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import connections from './playwright.connections.config'

// A production shell on a separate port, safe to run beside another worktree's browser suite.
export default defineConfig({
  ...base,
  testMatch: ['pwa-auth-cache.spec.ts'],
  projects: [...base.projects!.filter(project => project.name === 'desktop'), ...connections.projects!],
  use: { ...base.use, baseURL: 'http://localhost:5179' },
  webServer: {
    command: 'npm run build -- --mode e2e && npx vite preview --port 5179 --strictPort',
    url: 'http://localhost:5179',
    env: { VITE_API_BASE_URL: 'http://localhost:5122' },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
