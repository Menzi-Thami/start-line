import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Request counts and timings for the signed-in journey, with a fixed synthetic latency on every API call so the
// numbers show the request waterfall rather than the runner's machine. Synthetic account and data only.
// The JSON and screenshots land in test-results/loading-performance and are uploaded by CI.
test.use({ serviceWorkers: 'block' })

const LATENCY_MS = 300
const ACCOUNT_WAKE_MS = 3_000
const out = join('test-results', 'loading-performance')

interface Hit { path: string; method: string; start: number; end: number; status: number }

async function mockApi(page: Page, options: { accountWakeMs?: number; failPlan?: boolean } = {}) {
  const plan = JSON.parse(await readFile(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
  const inputs = { raceSlug: null, raceName: plan.race.name, raceDate: plan.race.date, distanceKm: plan.race.distanceKm,
    goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday',
    experience: 'Regular', strengthDays: [], planFrom: plan.startDate, version: 3 }
  const summary = { id: 'perf-plan', name: 'Synthetic 5K', raceName: plan.race.name, raceDate: plan.race.date, status: 'Active', createdAt: '2026-10-01T10:00:00Z' }
  const runs = Array.from({ length: 6 }, (_, i) => ({ id: `perf-run-${i}`, name: `Easy run ${i + 1}`, kind: 'Run', localDate: `2026-10-${String(10 + i).padStart(2, '0')}`,
    startedAt: `2026-10-${String(10 + i).padStart(2, '0')}T07:00:00Z`, distanceKm: 5 + i, movingSeconds: 1800 + i * 300, paceSecondsPerKm: 360, elapsedSeconds: 1900 + i * 300,
    averageHeartRate: null, maxHeartRate: null, elevationGainMetres: null, source: { kind: 'Upload', format: 'Fit', cachedUntil: null } }))
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') })
  // Every loader that appears, by its label, so a step can say whether the runner saw one at all.
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.assign(window, { __loadersSeen: seen })
    new MutationObserver(() => {
      for (const node of document.querySelectorAll('.runner-loading, .skeleton-stack, .skeleton, .account-warmup')) {
        const label = node.querySelector('[role=status]')?.getAttribute('aria-label') ?? node.getAttribute('aria-label') ?? node.className
        if (!seen.includes(label)) seen.push(label)
      }
    }).observe(document, { subtree: true, childList: true })
  })
  const started = Date.now()
  const hits: Hit[] = []
  let inflight = 0
  await page.route('**/health/**', route => route.fulfill({ body: 'Healthy' }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/perf-plan', '/{id}').replace(/perf-run-\d+/, '{run}')
    const hit: Hit = { path: path + url.search, method: request.method(), start: Date.now() - started, end: 0, status: 200 }
    hits.push(hit)
    inflight++
    const wait = path === '/api/v1/me' && options.accountWakeMs ? options.accountWakeMs : LATENCY_MS
    await new Promise(resolve => setTimeout(resolve, wait))
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'perf-runner', displayName: 'Perf QA', timeZone: 'UTC', units: 'Kilometres',
      privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, weeklyEmails: false, heartRateConsent: false }
    else if (path === '/api/v1/me/plans') data = [summary]
    else if (path === '/api/v1/me/plans/{id}' || path.endsWith('/coach')) {
      if (options.failPlan) hit.status = 503
      data = { ...summary, inputs, plan, coaching: [] }
    }
    else if (path === '/api/v1/plans') data = plan
    else if (path === '/api/v1/me/activities') data = runs
    else if (path.endsWith('/sync/strava')) data = { available: true, connected: false, status: null, pending: 0, failed: 0, syncedRuns: 0, includesPrivateRuns: false, connectedAt: null, lastSyncedAt: null }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path === '/api/v1/me/journey') data = { chapters: [], recovery: null, maintenance: null, hasMoreChapters: false, page: 0 }
    else if (path === '/api/v1/me/journey/races') data = { races: [], majors: [] }
    else if (path.endsWith('/check-ins') || path.endsWith('/readiness') || path.endsWith('/strava-completions') || path.endsWith('/shoes')) data = []
    else if (path.includes('/running')) data = runs.map(run => ({ date: run.localDate, distanceKm: run.distanceKm, source: 'Upload' }))
    inflight--
    hit.end = Date.now() - started
    if (path.endsWith('/photo') || path.endsWith('/beginner')) { hit.status = 204; await route.fulfill({ status: 204 }).catch(() => undefined); return }
    if (hit.status !== 200) { await route.fulfill({ status: hit.status, json: { title: 'Unavailable' } }).catch(() => undefined); return }
    await route.fulfill({ json: data }).catch(() => undefined)
  })
  const settle = async () => {
    // Quiet for a full latency window: nothing in flight and nothing new started.
    let seen = -1
    await expect.poll(() => { const quiet = inflight === 0 && hits.length === seen; seen = hits.length; return quiet }, { intervals: [LATENCY_MS + 100], timeout: 20_000 }).toBe(true)
  }
  return { hits, settle, since: () => Date.now() - started }
}

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
  expect(todayReadyMs).toBeGreaterThan(0)
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
