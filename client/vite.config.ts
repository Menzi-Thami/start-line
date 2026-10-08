/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // The API runs separately in development; same-origin requests avoid CORS entirely.
    proxy: { '/api': 'http://localhost:5122' },
  },
  test: {
    environment: 'jsdom',
    // Forked workers time out starting on slow Windows machines; threads start reliably everywhere.
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Node's fetch needs an absolute URL; MSW handlers match any origin.
    env: { VITE_API_BASE_URL: 'http://localhost:3000' },
    coverage: { include: ['src/**/*.{ts,tsx}'], exclude: ['src/lib/api-schema.ts', 'src/main.tsx', 'src/test/**'] },
  },
})
