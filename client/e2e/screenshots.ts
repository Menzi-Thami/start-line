import type { TestInfo } from '@playwright/test'

/** Keep published Chromium comparisons stable when another browser suite runs afterward. */
export function screenshotPath(info: TestInfo, group: 'redesign' | 'refinements', name: string) {
  return info.project.use.browserName === 'firefox'
    ? info.outputPath(name)
    : `../docs/qa/2026-11-04/${group}/${name}`
}
