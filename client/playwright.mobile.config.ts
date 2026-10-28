import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Additional engine/device coverage. Physical-device checks are recorded separately in docs/device-validation.md.
export default defineConfig({
  ...base,
  grep: /@phone/,
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit', channel: undefined } },
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit', channel: undefined } },
  ],
})
