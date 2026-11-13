import { expect, test } from '@playwright/test'

test('dragging a workout opens a compact confirmation that does not auto-save @phone', async ({ page }) => {
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/move-run.html')
  const source = page.locator('.week-day-button[draggable="true"]').first()
  const from = await source.getAttribute('data-date')
  const target = page.locator('.week-day-button[data-date]').last()
  const to = await target.getAttribute('data-date')
  if (!from || !to || from === to) throw new Error('Fixture must expose distinct source and destination')

  // Browser drag on desktop, fallback Move run button on mobile where long-press uses TouchEvents.
  if (test.info().project.name === 'phone') await page.getByRole('button', { name: 'Move run', exact: true }).click()
  else await source.dragTo(target)
  const dialog = page.getByRole('dialog', { name: 'Move this run?' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('#saved-state')).toHaveText('Not saved')
  if (test.info().project.name === 'phone') {
    await dialog.getByRole('group', { name: 'Available dates' }).getByRole('button').first().click()
  }
  await expect(dialog.getByRole('button', { name: 'Move run', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Move run', exact: true }).click()
  await expect(page.locator('#saved-state')).toHaveText('Saved')
  await expect(page.getByRole('dialog', { name: 'Run moved' }).getByText('Saved! Your training calendar has been updated.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})
