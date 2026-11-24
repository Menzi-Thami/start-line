import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import connections from './playwright.connections.config'

// Separate port permits simultaneous release QA in another worktree.
process.env.AUTH_QA_ORIGIN = 'http://127.0.0.1:5177'
export default defineConfig({
  ...base,
  testMatch: ['auth-gate.spec.ts'],
  projects: [...base.projects!.filter(project => project.name === 'desktop'), ...connections.projects!],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177/e2e/fixtures/auth-gate.html',
    reuseExistingServer: !process.env.CI,
  },
})
