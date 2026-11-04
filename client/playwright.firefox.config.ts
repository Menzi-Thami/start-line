import { defineConfig } from '@playwright/test'
import redesign from './playwright.redesign.config'

export default defineConfig({
  ...redesign,
  projects: [{ name: 'firefox', use: { browserName: 'firefox', launchOptions: {} } }],
})
