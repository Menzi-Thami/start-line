import { expect, test, type Page } from '@playwright/test'

async function phonePhoto(page: Page, width: number, height: number, mime = 'image/jpeg') {
  const dataUrl = await page.evaluate(({ width, height, mime }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(width, height)
    let seed = 7291
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      pixels.data[i] = seed & 255
      pixels.data[i + 1] = (seed >>> 8) & 255
      pixels.data[i + 2] = (seed >>> 16) & 255
      pixels.data[i + 3] = mime === 'image/png' && i % 8 === 0 ? 0 : 255
    }
    context.putImageData(pixels, 0, 0)
    return canvas.toDataURL(mime, 0.98)
  }, { width, height, mime })
  return { name: mime === 'image/png' ? 'phone-landscape.png' : 'phone-portrait.jpg', mimeType: mime, buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') }
}

async function mockPhotos(page: Page) {
  const state = { photo: null as string | null, puts: 0, deletes: 0, failSave: false, failDelete: false }
  await page.route('**/api/v1/me/photo', async route => {
    const method = route.request().method()
    if (method === 'PUT') {
      state.puts++
      if (state.failSave) { await route.fulfill({ status: 503 }); return }
      const body = route.request().postDataJSON() as { dataUrl: string }
      expect(Object.keys(body)).toEqual(['dataUrl'])
      expect(Buffer.from(body.dataUrl.split(',')[1]!, 'base64').length).toBeLessThanOrEqual(24 * 1024)
      state.photo = body.dataUrl
      await route.fulfill({ json: { dataUrl: state.photo } })
    } else if (method === 'DELETE') {
      state.deletes++
      if (state.failDelete) { await route.fulfill({ status: 503 }); return }
      state.photo = null
      await route.fulfill({ status: 204 })
    } else if (state.photo) await route.fulfill({ json: { dataUrl: state.photo } })
    else await route.fulfill({ status: 204 })
  })
  return state
}

test('large phone photos become small avatars, survive reload and replace/delete the current picture @phone', async ({ page }, info) => {
  const state = await mockPhotos(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/profile-picture.html')
  const source = await phonePhoto(page, 3024, 4032)
  expect(source.buffer.length).toBeGreaterThan(1024 * 1024)
  await page.locator('input[type=file]').setInputFiles(source)
  await expect(page.getByRole('img', { name: 'Your picture', exact: true })).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.puts).toBe(1)
  const first = state.photo!
  const dimensions = await page.evaluate(async dataUrl => {
    const image = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const size = { width: image.width, height: image.height }; image.close(); return size
  }, first)
  expect(dimensions.width).toBeLessThanOrEqual(256)
  expect(dimensions.width).toBe(dimensions.height)
  await page.reload()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', first)
  await page.locator('input[type=file]').setInputFiles(await phonePhoto(page, 2048, 1536, 'image/png'))
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.puts).toBe(2)
  expect(state.photo).not.toBe(first)
  await page.screenshot({ path: info.outputPath('compressed-profile-picture.png'), fullPage: true })
  await page.getByRole('button', { name: 'Remove picture', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Your initials, Picture QA', exact: true })).toBeVisible()
  expect(state.photo).toBeNull()
  await page.reload()
  await expect(page.getByRole('img', { name: 'Your initials, Picture QA', exact: true })).toBeVisible()
})

test('failed uploads/deletes and unsupported phone files preserve the current picture and allow retry @phone', async ({ page }) => {
  const state = await mockPhotos(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/profile-picture.html')
  await page.locator('input[type=file]').setInputFiles(await phonePhoto(page, 400, 600))
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  const original = state.photo!
  // Exercise the native <img> decoding fallback used when ImageBitmap cannot decode a phone format.
  await page.evaluate(() => { window.createImageBitmap = () => Promise.reject(new Error('Decoder unavailable')) })
  const replacement = await phonePhoto(page, 1600, 1200, 'image/png')
  state.failSave = true
  await page.locator('input[type=file]').setInputFiles(replacement)
  await expect(page.getByText(/Something went wrong on our side/)).toBeVisible()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', original)
  state.failSave = false
  await page.locator('input[type=file]').setInputFiles(replacement)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.puts).toBe(3)
  const current = state.photo!
  await page.locator('input[type=file]').setInputFiles({ name: 'unreadable.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') })
  await expect(page.getByText(/couldn’t be read on this device/)).toBeVisible()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', current)
  expect(state.puts).toBe(3)
  state.failDelete = true
  await page.getByRole('button', { name: 'Remove picture', exact: true }).click()
  await expect(page.getByText(/Something went wrong on our side/)).toBeVisible()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', current)
  state.failDelete = false
  await page.getByRole('button', { name: 'Remove picture', exact: true }).dblclick()
  await expect(page.getByRole('img', { name: 'Your initials, Picture QA', exact: true })).toBeVisible()
  expect(state.deletes).toBe(2)
})
