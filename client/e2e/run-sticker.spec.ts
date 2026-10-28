import { expect, test } from '@playwright/test'

test('production image policy permits a locally generated PNG sticker preview @phone', async ({ page, request }) => {
  const response = await request.get('/staticwebapp.config.json')
  expect(response.ok()).toBe(true)
  const config = await response.json() as { globalHeaders: Record<string, string> }
  const policy = config.globalHeaders['Content-Security-Policy']!
  await page.setContent('<!doctype html><html><head></head><body></body></html>')
  const rendered = await page.evaluate(async (content) => {
    const meta = document.createElement('meta')
    meta.httpEquiv = 'Content-Security-Policy'
    meta.content = content
    document.head.append(meta)
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return false
    const url = URL.createObjectURL(blob)
    try {
      return await new Promise<boolean>((resolve) => {
        const image = new Image()
        image.onload = () => resolve(image.naturalWidth === 32 && blob.type === 'image/png')
        image.onerror = () => resolve(false)
        image.src = url
        document.body.append(image)
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }, policy)
  expect(rendered).toBe(true)
})
