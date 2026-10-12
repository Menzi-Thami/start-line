import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    // Small font subsets would otherwise be inlined as data: URIs, which the site's CSP (font-src 'self') blocks.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  server: {
    // The API runs separately in development; same-origin requests avoid CORS entirely.
    proxy: { '/api': 'http://localhost:5122' },
  },
  test: {
    environment: 'jsdom',
    // Forked workers time out starting on slow Windows machines; threads start reliably everywhere.
    pool: 'threads',
    // Playwright's end-to-end specs run in a real browser, not here.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Node's fetch needs an absolute URL; MSW handlers match any origin.
    env: { VITE_API_BASE_URL: 'http://localhost:3000' },
    coverage: { include: ['src/**/*.{ts,tsx}'], exclude: ['src/lib/api-schema.ts', 'src/main.tsx', 'src/test/**'] },
  },
})
