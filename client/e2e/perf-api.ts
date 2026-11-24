import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// The synthetic signed-in API behind journey.html, with a fixed latency per call, used by the loading specs.
// Synthetic account and data only.
export const LATENCY_MS = 300
export const ACCOUNT_WAKE_MS = 3_000
export const out = join('test-results', 'loading-performance')

export interface Hit { path: string; method: string; start: number; end: number; status: number }

export async function mockApi(page: Page, options: { accountWakeMs?: number; failPlan?: boolean; latencyMs?: number; hold?: (path: string) => boolean; healthDown?: boolean } = {}) {
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
  const held: { path: string; release: () => void }[] = []
  let health = 0
  await page.route('**/health/**', route => { health++; return options.healthDown ? route.fulfill({ status: 503, body: 'Unhealthy' }) : route.fulfill({ body: 'Healthy' }) })
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/perf-plan', '/{id}').replace(/perf-run-\d+/, '{run}')
    const hit: Hit = { path: path + url.search, method: request.method(), start: Date.now() - started, end: 0, status: 200 }
    hits.push(hit)
    inflight++
    const wait = path === '/api/v1/me' && options.accountWakeMs ? options.accountWakeMs : options.latencyMs ?? LATENCY_MS
    await new Promise(resolve => setTimeout(resolve, wait))
    // A held call waits until the test releases it, as a stuck server would.
    if (options.hold?.(path)) await new Promise<void>(release => held.push({ path, release }))
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
  return { hits, held, settle, since: () => Date.now() - started, inflight: () => inflight, health: () => health }
}

