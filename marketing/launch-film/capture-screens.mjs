// Captures the real app screens the film shows, into assets/. Usage, from the repo root, with the API running
// locally on port 5123 (see README.md): node marketing/launch-film/capture-screens.mjs
//
// The app runs from this branch's own source through Vite on port 5201. Its clock is pinned to the film's "today",
// so the countdown, the builder's dates and the plan are what the app shows on that day. Nothing here edits a
// screen: every pixel is the app's own.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const client = resolve(here, '../../client')
const load = (p) => import(pathToFileURL(resolve(client, 'node_modules', p)).href)
const { createServer } = await load('vite/dist/node/index.js')
const { chromium } = await load('@playwright/test/index.mjs')

// The API accepts a plan built up to a day ahead of its clock or up to 400 days back, so this date re-renders until
// early December 2027.
export const TODAY = '2026-11-01T08:00:00'
const PORT = 5201
const API = process.env.FILM_API ?? 'http://localhost:5123'
const out = resolve(here, 'assets')
mkdirSync(out, { recursive: true })

const vite = await createServer({
  root: client,
  configFile: resolve(client, 'vite.config.ts'),
  server: { port: PORT, strictPort: true, proxy: { '/api': API, '/health': API } },
  logLevel: 'warn',
})
await vite.listen()

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce' })
const page = await context.newPage()
await page.clock.setFixedTime(new Date(TODAY))
const still = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`

async function settle() {
  await page.addStyleTag({ content: still })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

/** The builder's current question, scrolled to the top of the phone screen. */
async function shootStep(name, fullPage = false) {
  // The masthead sticks to the top, so the question sits just under it.
  await page.evaluate(() => {
    const title = document.querySelector('.wizard-title')
    const mast = document.querySelector('.masthead')?.getBoundingClientRect().height ?? 0
    window.scrollTo(0, title.getBoundingClientRect().top + window.scrollY - mast - 8)
  })
  await settle()
  await page.screenshot({ path: `${out}/${name}.png`, fullPage })
  console.log('captured', name)
}

// Where things sit on each tall screen, in CSS pixels from the top, so the film's camera moves come from the page.
const anchors = {}
const anchor = (screen, marks) =>
  page.evaluate((marks) => Object.fromEntries(Object.entries(marks).map(([k, sel]) => [k, Math.round(document.querySelector(sel).getBoundingClientRect().top + window.scrollY)])), marks)
    .then((found) => { anchors[screen] = { ...anchors[screen], ...found } })

const continueOn = () => page.getByRole('button', { name: 'Continue' }).click()

// The landing page: its hero copy and the runner card's real countdown, for the hook and the close.
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.locator('.countdown').waitFor()
await settle()
const landing = await page.evaluate(() => {
  const text = (s) => document.querySelector(s)?.textContent.trim().replace(/\s+/g, ' ')
  const fill = document.querySelector('.countdown-fill')
  const ring = parseFloat(fill.style.strokeDasharray)
  const offset = parseFloat(fill.style.getPropertyValue('--ring-offset'))
  return {
    proof: text('.hero-proof strong'),
    proofSmall: 'or any race you name',
    headline: text('.intro.hero h1'),
    lede: text('.intro.hero .hero-copy > p'),
    cta: text('.hero-actions .button-primary'),
    days: text('.countdown-number span'),
    daysLabel: text('.countdown-number small'),
    race: text('.countdown-race strong'),
    raceMeta: text('.countdown-race .mono'),
    ringFill: 1 - offset / ring,
  }
})
writeFileSync(`${out}/landing.json`, JSON.stringify({ today: TODAY.slice(0, 10), ...landing }, null, 2) + '\n')
console.log('landing', landing)

// The builder, one question at a time: Thami's own race.
await page.getByRole('radio', { name: /Another race/ }).check({ force: true })
await page.getByRole('group', { name: /distance/i }).getByText('Half', { exact: true }).click()
await page.locator('#race-date').click()
const raceDay = page.getByRole('button', { name: 'Sunday 28 February 2027', exact: true })
for (let i = 0; i < 24 && !(await raceDay.count()); i++) await page.getByRole('button', { name: 'Next month' }).click()
await raceDay.click()
await page.locator('#race-name').fill('Hoka Half')
await page.locator('#race-name').blur()
// The film scrolls this step, so it's shot as a whole page with the app's sticky masthead and button bar cut out and
// shot on their own; the film pins them back to the phone's top and bottom edges, where the app keeps them.
await shootStep('builder-race-view')
await page.locator('.masthead').screenshot({ path: `${out}/builder-race-masthead.png` })
await page.locator('.wizard-nav').screenshot({ path: `${out}/builder-race-nav.png` })
const unstick = await page.addStyleTag({ content: '.masthead,.wizard-nav{position:static!important}.back-to-top{display:none!important}' })
await anchor('builder-race', { title: '.wizard-title', other: '.choice-other', name: '#race-name', nav: '.wizard-nav' })
anchors['builder-race'].masthead = await page.locator('.masthead').evaluate((m) => Math.round(m.getBoundingClientRect().height))
await shootStep('builder-race', true)
await unstick.evaluate((tag) => tag.remove())
await continueOn()

const goal = page.getByRole('group', { name: 'Goal finish time' })
await goal.getByLabel('Hours').fill('1')
await goal.getByLabel('Minutes').fill('50')
await goal.getByLabel('Minutes').blur()
await shootStep('builder-goal')
await continueOn()

const days = page.getByRole('group', { name: 'Which days can you run?' })
for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
  const box = days.getByRole('checkbox', { name: day, exact: true })
  if (!(await box.count())) continue
  const want = ['Tue', 'Thu', 'Sat', 'Sun'].includes(day)
  if ((await box.isChecked()) !== want) await box.click({ force: true })
}
await page.getByRole('group', { name: 'Which one is your long run?' }).getByText('Sun', { exact: true }).click()
await shootStep('builder-days')
await continueOn()
await continueOn()
await shootStep('builder-check')

await page.getByRole('button', { name: 'Build my plan' }).click()
await page.getByRole('heading', { name: 'Hoka Half' }).waitFor()
await page.waitForLoadState('networkidle')
await page.evaluate(() => window.scrollTo(0, 0))
await settle()
await anchor('plan-week', { tabs: '[role=tablist]', week: '[role=tabpanel] h2, [role=tabpanel] h3' })
await page.screenshot({ path: `${out}/plan-week.png`, fullPage: true })
console.log('captured plan-week', page.url())
writeFileSync(`${out}/plan-link.txt`, page.url().replace(`http://localhost:${PORT}`, 'https://taperday.run') + '\n')

await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
await page.waitForLoadState('networkidle')
await settle()
await anchor('plan-calendar', { tabs: '[role=tablist]', month: '[role=tabpanel]' })
await page.screenshot({ path: `${out}/plan-calendar.png`, fullPage: true })
console.log('captured plan-calendar')

writeFileSync(`${out}/anchors.json`, JSON.stringify(anchors, null, 2) + '\n')
await browser.close()
await vite.close()
