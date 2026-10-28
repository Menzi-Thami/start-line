import { expect, test } from '@playwright/test'

test('form fields and navigation remain usable on handheld screens @phone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: /Another race/ }).check()
  await expect(page.getByRole('radio', { name: /Another race/ })).toBeChecked()
  const distance = page.getByRole('textbox', { name: /^Distance/ })
  await distance.fill('10')
  await distance.focus()
  await expect(distance).toBeFocused()
  const box = await distance.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  // The same content must remain operable after a landscape rotation.
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.height, height: viewport.width })
  await expect(distance).toBeVisible()
  await expect(distance).toHaveValue('10')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter the race date.')
})
