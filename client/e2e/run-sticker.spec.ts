import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

test('all sticker layouts export real PNGs, preserve actual metrics and keep the clear layout transparent @phone', async ({ page }) => {
  const asset = readdirSync(fileURLToPath(new URL('../dist/assets/', import.meta.url))).find((name) => /^run-sticker-.*\.js$/.test(name))
  expect(asset).toBeTruthy()
  await page.goto('/')
  const results = await page.evaluate(async (modulePath) => {
    const renderer = await import(modulePath) as { renderRunSticker: (run: object, units: string, layout: string) => Promise<Blob> }
    const observed: string[] = []
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      observed.push(text)
      if (maxWidth === undefined) original.call(this, text, x, y)
      else original.call(this, text, x, y, maxWidth)
    }
    try {
      const output = []
      for (const layout of ['portrait', 'horizontal', 'transparent']) {
        observed.length = 0
        const blob = await renderer.renderRunSticker({ date: '2026-10-28', title: 'Easy long run', distanceKm: 10, seconds: 3600, source: 'Strava' }, 'km', layout)
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width; canvas.height = bitmap.height
        const context = canvas.getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let painted = 0
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) painted++
        output.push({ layout, width: bitmap.width, height: bitmap.height, type: blob.type, corner: pixels[3], coverage: painted / (pixels.length / 4), text: [...observed] })
        bitmap.close()
      }
      observed.length = 0
      await renderer.renderRunSticker({ date: '2026-10-28', title: 'Run', seconds: 2530, source: 'Manual' }, 'km', 'transparent')
      return { output, timedText: [...observed] }
    } finally { CanvasRenderingContext2D.prototype.fillText = original }
  }, `/assets/${asset}`)
  expect(results.output.map((r) => [r.width, r.height])).toEqual([[1080, 1280], [1600, 900], [1600, 700]])
  for (const result of results.output) {
    expect(result.type).toBe('image/png')
    expect(result.corner).toBe(0)
    expect(result.text).toContain('Easy long run')
    expect(result.text).toContain('1:00:00')
    expect(result.text).toContain('6:00/km')
    expect(result.text).toContain('Powered by Strava')
    expect(result.text.some((line) => line.includes('28 October 2026'))).toBe(true)
    if (result.layout === 'transparent') {
      expect(result.coverage).toBeGreaterThan(.01)
      expect(result.coverage).toBeLessThan(.35)
    } else expect(result.coverage).toBeGreaterThan(.7)
  }
  expect(results.timedText).toContain('42:10')
  expect(results.timedText.filter((t) => t === 'Not recorded')).toHaveLength(2)
  expect(results.timedText.some((t) => t.includes('/km'))).toBe(false)
})
