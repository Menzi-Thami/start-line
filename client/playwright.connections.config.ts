import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Account connection recovery, imported race results and portrait image exports run in every engine on every PR.
// Mobile projects emulate browser/device profiles; actual native sharing and delivery need physical devices.
export default defineConfig({
  ...base,
  testMatch: ['offline-check-ins.spec.ts', 'finish-line.spec.ts', 'race-review.spec.ts', 'training-recovery.spec.ts', 'mobile-usability.spec.ts', 'strava-completion.spec.ts', 'journey-cabinet.spec.ts', 'manual-race.spec.ts', 'phone-runs.spec.ts'],
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit', channel: undefined, launchOptions: {} } },
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit', channel: undefined, launchOptions: {} } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], browserName: 'firefox', channel: undefined, launchOptions: {} } },
  ],
})
