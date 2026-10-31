import { expect, test } from '@playwright/test'

// Brand regression: the rendered app (not just token source) must use the Frame skin.
test('Frame colors, SVG animation accents and responsive shell @phone', async ({ page }) => {
  await page.goto('/')
  const design = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      paper: style.getPropertyValue('--paper').trim(),
      accent: style.getPropertyValue('--accent').trim(),
      ink: style.getPropertyValue('--ink').trim(),
      bodyFont: getComputedStyle(document.body).fontFamily,
    }
  })
  expect(['#fff', '#ffffff']).toContain(design.paper)
  expect(design.accent).toBe('#4f6f45')
  expect(['#111', '#111111']).toContain(design.ink)
  expect(design.bodyFont).toContain('Instrument Sans')

  const introAccent = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'race-intro-go'
    document.body.append(el)
    const value = getComputedStyle(el).color
    el.remove()
    return value
  })
  expect(introAccent).toBe('rgb(79, 111, 69)')

  for (const width of [320, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow, `Frame shell at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('Frame reduced motion removes decorative animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const running = await page.evaluate(() =>
    document.body.getAnimations({ subtree: true })
      .filter(a => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 1)
      .length,
  )
  expect(running).toBe(0)
})
