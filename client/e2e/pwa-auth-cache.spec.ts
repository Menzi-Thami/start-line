import { expect, test } from '@playwright/test'

test('PWA shell never retains callback codes or private navigation URLs in cache metadata @phone', async ({ page, context }) => {
  // A disposable context and synthetic code only. No identity provider or Strava is called.
  await page.goto('/manifest.webmanifest')
  const seeded = await page.evaluate(async () => {
    const old = await caches.open('taperday-v3')
    const response = await fetch('/strava/callback?code=synthetic-qa-code&state=synthetic-qa-state')
    await old.put('/', response)
    return (await old.match('/'))!.url.includes('synthetic-qa-code')
  })
  expect(seeded).toBe(true) // Reproduces the old metadata leak, without an actual credential.
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('taperday-v3')
  await page.reload() // Fill the controlled shell's asset cache for offline reopen.
  await expect(page.locator('.masthead')).toBeVisible()
  await page.goto('/strava/callback?code=synthetic-qa-code&state=synthetic-qa-state')
  await expect.poll(() => page.evaluate(async () => {
    const response = await (await caches.open('taperday-v4')).match('/')
    return response?.url
  })).toBe('')
  await page.goto('/?view=home&run=synthetic-private-run')
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('taperday-v4')
    const responses = await Promise.all((await cache.keys()).map(async key => ({ key: key.url, url: (await cache.match(key))!.url })))
    const shell = await cache.match('/')
    return { responses, html: await shell!.text(), contentType: shell!.headers.get('content-type'), contentEncoding: shell!.headers.get('content-encoding') }
  })
  expect(JSON.stringify(cached.responses)).not.toMatch(/synthetic-qa-code|synthetic-qa-state|synthetic-private-run/)
  expect(cached.html).toContain('<html')
  expect(cached.contentType).toContain('text/html')
  expect(cached.contentEncoding).toBeNull()
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.masthead')).toBeVisible()
  await context.setOffline(false)
})
