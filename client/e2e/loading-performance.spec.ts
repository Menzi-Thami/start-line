import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ACCOUNT_WAKE_MS, LATENCY_MS, mockApi, out, type Hit } from './perf-api'

// Request counts and timings for the signed-in journey, with a fixed synthetic latency on every API call so the
// numbers show the request waterfall rather than the runner's machine. Synthetic account and data only.
// The JSON and screenshots land in test-results/loading-performance and are uploaded by CI.
test.use({ serviceWorkers: 'block' })

const summarise = (hits: Hit[], from = 0) => {
  const counts: Record<string, number> = {}
  for (const hit of hits) counts[`${hit.method} ${hit.path}`] = (counts[`${hit.method} ${hit.path}`] ?? 0) + 1
  // Network time for the step: from the tap to the last response it caused (0 when it needed none).
  const networkMs = hits.length ? Math.max(...hits.map(hit => hit.end)) - from : 0
  return { total: hits.length, networkMs, duplicates: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 1)), counts }
}
const loadersSeen = (page: Page) => page.evaluate(() => (window as unknown as { __loadersSeen: string[] }).__loadersSeen.splice(0))

async function record(name: string, data: unknown) {
  await mkdir(out, { recursive: true })
  await writeFile(join(out, `${name}.json`), JSON.stringify(data, null, 2))
  console.log(`[loading-performance] ${name} ${JSON.stringify(data)}`)
}

test('signed-in journey: request counts and time to Today on a cold start', async ({ page }, info) => {
  const api = await mockApi(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
  const today = page.getByRole('region', { name: 'Today', exact: true })
  await expect(today).toBeVisible()
  await expect(today.getByRole('status', { name: "Loading today's session" })).toHaveCount(0, { timeout: 20_000 })
  const todayReadyMs = api.since()
  await api.settle()
  const startup = api.hits.slice()
  const steps: Record<string, ReturnType<typeof summarise> & { loaders: string[] }> = { startup: { ...summarise(startup), loaders: await loadersSeen(page) } }
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  for (const tab of ['Plan', 'Runs', 'Journey', 'Account', 'Home', 'Runs']) {
    const before = api.hits.length
    await loadersSeen(page)
    const tapped = api.since()
    await nav.getByRole('button', { name: tab, exact: true }).click()
    await api.settle()
    steps[`${tab} (#${Object.keys(steps).length})`] = { ...summarise(api.hits.slice(before), tapped), loaders: await loadersSeen(page) }
  }
  await page.screenshot({ path: join(out, `journey-end-${info.project.name}.png`) })
  await record(`journey-${info.project.name}`, {
    latencyMs: LATENCY_MS, todayReadyMs, startupWaterfall: startup.map(({ method, path, start, end }) => `${method} ${path} ${start}-${end}`), steps,
  })
  // Startup asks for nothing twice, and the coach read runs alongside the plan details rather than after them.
  expect(steps.startup.duplicates).toEqual({})
  const details = startup.find(hit => hit.method === 'GET' && hit.path === '/api/v1/me/plans/{id}')!
  const coach = startup.find(hit => hit.method === 'POST' && hit.path === '/api/v1/me/plans/{id}/coach')!
  expect(coach.start).toBeLessThan(details.end)
  const checkIns = startup.find(hit => hit.path === '/api/v1/me/plans/{id}/check-ins')!
  expect(checkIns.start).toBeLessThan(details.end)
  // Opening the runner's own plan from Home uses the coached copy Home already has: no regeneration first.
  const plan = Object.entries(steps).find(([name]) => name.startsWith('Plan'))![1]
  expect(plan.counts['POST /api/v1/plans'] ?? 0).toBe(0)
  // Runs shows the recordings Home already read while they refresh: no "Loading your runs" wait.
  for (const [name, step] of Object.entries(steps).filter(([name]) => name.startsWith('Runs'))) expect(step.loaders, name).not.toContain('Loading your runs…')
  // No screen asks for the same thing twice, and coming back to Home shows the plan it already had.
  for (const [name, step] of Object.entries(steps)) expect(step.duplicates, name).toEqual({})
  const home = Object.entries(steps).find(([name]) => name.startsWith('Home'))![1]
  expect(home.loaders).not.toContain("Loading today's session")
})

test('slow account wake shows one runner wait and no stray loaders once ready', async ({ page }, info) => {
  const api = await mockApi(page, { accountWakeMs: ACCOUNT_WAKE_MS })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
  const waits = page.locator('.runner-loading, .account-warmup, .skeleton-stack, .wait-spinner, .loading-line')
  await expect(waits.first()).toBeVisible()
  const visibleWaits = await waits.evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).offsetParent !== null).length)
  await mkdir(out, { recursive: true })
  await page.screenshot({ path: join(out, `account-wait-${info.project.name}.png`) })
  const today = page.getByRole('region', { name: 'Today', exact: true })
  await expect(today.getByRole('status', { name: "Loading today's session" })).toHaveCount(0, { timeout: 20_000 })
  await expect(today).toBeVisible()
  const todayReadyMs = api.since()
  await api.settle()
  await expect(page.locator('.runner-loading, .account-warmup, .wait-spinner')).toHaveCount(0)
  await record(`account-wake-${info.project.name}`, { accountWakeMs: ACCOUNT_WAKE_MS, latencyMs: LATENCY_MS, visibleWaitsDuringWake: visibleWaits, todayReadyMs, startup: summarise(api.hits) })
})
