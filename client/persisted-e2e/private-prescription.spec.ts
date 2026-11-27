import { test, expect } from '@playwright/test'
// @ts-expect-error Synthetic JSON contract sample is shared with the private import guide.
import { sample } from '../../scripts/private-prescription-sample.mjs'

for (const width of [390, 1440]) for (const theme of ['light', 'dark'] as const) test.describe(`${width} ${theme}`, () => {
  const subject = `synthetic-private-browser-${width}-${theme}`
  test.use({ extraHTTPHeaders: { 'X-Test-User': subject } })
  test('@phone private import, real SQL activation, plan parity, gym completion, reload and logout', async ({ page, request }) => {
    await page.addInitScript(subject => Object.defineProperty(window, 'syntheticPrivateSubject', { value: subject }), subject)
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(theme => localStorage.setItem('taperday:theme', theme), theme)
    await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
    await page.goto('/e2e/fixtures/private-prescription.html?view=account')
    await page.getByText('Data & privacy', { exact: true }).click()
    await page.getByText('Private prescription', { exact: true }).click()
    await page.getByLabel('Prescription file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample())) })
    await expect(page.getByRole('region', { name: 'Private prescription preview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make prescription current' })).toBeDisabled()
    await page.getByRole('checkbox', { name: /I reviewed this prescription/ }).check()
    await page.getByRole('button', { name: 'Make prescription current' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Your private prescription is current' })).toBeVisible()
    await page.getByRole('button', { name: 'Plan', exact: true }).click()
    await expect(page.getByText('Synthetic private run', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Share link' })).toHaveCount(0)
    expect(page.url()).not.toContain('goal=')
    expect(page.url()).not.toContain('raceName=')
    await page.getByRole('tab', { name: 'Strength', exact: true }).click()
    await page.getByRole('button', { name: 'Complete gym', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Undo gym completion' })).toBeVisible()
    await page.screenshot({ path: `../docs/qa/2026-11-26/private-prescription/gym-${width}-${theme}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const active = (await (await request.get('http://127.0.0.1:5142/api/v1/me/plans')).json()).find((p: { status: string }) => p.status === 'Active')
    const response = await request.get(`http://127.0.0.1:5142/api/v1/me/plans/${active.id}`)
    expect(response.ok()).toBe(true)
    const persisted = await response.json()
    expect(persisted.plan.isPrivate).toBe(true)
    expect(persisted.plan.weeks.flatMap((w: { sessions: { gymDone?: boolean }[] }) => w.sessions).filter((s: { gymDone?: boolean }) => s.gymDone)).toHaveLength(1)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Undo gym completion' })).toBeVisible()
    const stored = await page.evaluate(() => JSON.stringify(localStorage))
    expect(stored).not.toContain('Synthetic private gym')
    expect(stored).not.toContain('Synthetic 10K')
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByText('Synthetic private gym', { exact: true })).toHaveCount(0)
  })
})


test('same-name accounts with different verified IDs cannot see the previous private prescription', async ({ page, request }) => {
  await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  const previewResponse = await request.post('http://127.0.0.1:5142/api/v1/me/private-prescriptions/preview', { data: sample() })
  expect(previewResponse.ok()).toBe(true)
  const preview = await previewResponse.json()
  const activation = await request.post(`http://127.0.0.1:5142/api/v1/me/private-prescriptions/${preview.importId}/activate`, {
    data: { token: preview.token, consentToReplace: true },
  })
  expect(activation.ok()).toBe(true)
  const { planId } = await activation.json()
  const otherHeaders = { 'X-Test-User': 'synthetic-private-browser-other' }
  const other = await request.put('http://127.0.0.1:5142/api/v1/me', { headers: otherHeaders, data: {
    displayName: 'Synthetic private runner', timeZone: 'Etc/UTC', units: 'Kilometres', weeklyEmails: false, acceptPrivacyNotice: true,
  } })
  expect(other.ok()).toBe(true)
  await page.goto(`/e2e/fixtures/private-prescription.html?view=build&privatePlan=${planId}`)
  await expect(page.getByText('Synthetic private run', { exact: true }).first()).toBeVisible()
  await page.setExtraHTTPHeaders(otherHeaders)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('synthetic-switch-account', { detail: 'synthetic-private-browser-other' })))
  await expect(page.getByText('Synthetic private run', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Synthetic private gym', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Welcome back, Synthetic private runner' })).toBeVisible()
  expect((await request.get(`http://127.0.0.1:5142/api/v1/me/plans/${planId}`, { headers: otherHeaders })).status()).toBe(404)
})
