import { expect, test, type Page } from '@playwright/test'

/*
 * Taperday's journeys, end to end against the real API and a production build:
 * the home page, building a plan one question at a time, finding your way round
 * the plan, subscribing a calendar to it and opening a shared link.
 */

const today = new Date()
const isoInDays = (days: number) => {
  const date = new Date(today)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const sharedLink = () =>
  `/?km=10&date=${isoInDays(56)}&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=${isoInDays(0)}`

const continueOn = (page: Page) => page.getByRole('button', { name: 'Continue' }).click()

test('the home page counts down to the next race on the list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('group', { name: /days to go: Two Oceans Ultra/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Which race?' })).toBeVisible()
})

test('builds a plan one question at a time, from a race on the list', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('radio', { name: /Comrades/ }).check({ force: true })
  await continueOn(page)

  const goal = page.getByRole('group', { name: 'Goal finish time' })
  await goal.getByLabel('Hours').fill('11')
  await continueOn(page)
  await expect(page.getByRole('group', { name: 'Which days can you run?' })).toBeVisible()
  await continueOn(page)
  await continueOn(page)

  await expect(page.getByText('Step 5 of 5')).toBeVisible()
  await page.getByRole('button', { name: 'Build my plan' }).click()

  await expect(page.getByRole('heading', { name: /Comrades/ })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Build your plan' })).toHaveCount(0)
  // The plan's answers live in the link, so it can be shared and reopened.
  expect(new URL(page.url()).searchParams.get('goal')).toBe(String(11 * 3600))
})

test('the plan opens on this week, and its tabs and keys move between views', async ({ page }) => {
  await page.goto(sharedLink())
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()

  const tabs = page.getByRole('tablist', { name: 'Your plan' })
  await expect(tabs.getByRole('tab')).toHaveText(['This week', 'All weeks', 'Strength', 'Paces', 'Progress'])
  await expect(tabs.getByRole('tab', { name: 'This week' })).toHaveAttribute('aria-selected', 'true')

  await tabs.getByRole('tab', { name: 'Paces' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Paces' })).toContainText('Recovery')

  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Progress' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Weekly distance' })).toBeVisible()
})

test('a calendar can subscribe to the plan, and the feed it subscribes to works', async ({ page, request }) => {
  await page.goto(sharedLink())
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()

  await page.getByText('Add to calendar').click()
  const apple = await page.getByRole('link', { name: /Apple Calendar/ }).getAttribute('href')
  expect(apple).toMatch(/^webcal:\/\/.+\/api\/v1\/plans\/calendar\.ics\?/)
  expect(await page.getByRole('link', { name: /Google Calendar/ }).getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\//)
  expect(await page.getByRole('link', { name: /Outlook/ }).getAttribute('href')).toMatch(/^https:\/\/outlook\.live\.com\//)

  // The same feed a calendar app would fetch.
  const feed = await request.get(apple!.replace(/^webcal:/, 'http:'))
  expect(feed.status()).toBe(200)
  expect(feed.headers()['content-type']).toContain('text/calendar')
  expect(await feed.text()).toContain('BEGIN:VEVENT')
})

test('a shared link builds the plan straight away and survives a reload', async ({ page }) => {
  await page.goto(sharedLink())
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()
  await expect(page.locator('.plan-progress')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()
})

test('distances switch to miles', async ({ page }) => {
  await page.goto(sharedLink())
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()

  await page.getByRole('radio', { name: 'Miles' }).check({ force: true })
  // A 10K is 6.2 miles.
  await expect(page.getByText('6.2 mi', { exact: true })).toBeVisible()
  // Remembered on this device for next time.
  expect(await page.evaluate(() => localStorage.getItem('startline:units'))).toBe('mi')
})

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('the starting-gun intro plays once per visit, and a tap skips it', async ({ page }) => {
    await page.goto('/')
    const intro = page.locator('.race-intro')
    await expect(intro).toBeVisible()

    await page.mouse.click(10, 10)
    await expect(intro).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Which race?' })).toBeVisible()
    await expect(intro).toHaveCount(0)
  })
})

test('on a phone nothing scrolls sideways @phone', async ({ page }) => {
  for (const path of ['/', sharedLink()]) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `sideways overflow on ${path}`).toBeLessThanOrEqual(0)
  }
})

test('Strava’s callback page loads the app, and the webhook stays shut without its secret @phone', async ({ page, request }) => {
  await page.goto('/strava/callback?state=x&code=y&scope=read')
  await expect(page.locator('main')).toBeVisible()
  // Accounts are off here, so the account view asks to sign in rather than connecting anything.
  await expect(page.getByText('Sign in to see your saved plans, runs and account.')).toBeVisible()

  const hook = await request.post('http://localhost:5122/api/v1/webhooks/strava/not-the-secret', { data: { object_type: 'activity' } })
  expect(hook.status()).toBe(404)
})
