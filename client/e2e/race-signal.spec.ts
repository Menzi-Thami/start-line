import { expect, test } from '@playwright/test'

// Brand regression: the rendered app (not just token source) must use Race Signal.
test('Race Signal colors, SVG animation accents and responsive shell @phone', async ({ page }) => {
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
  expect(design.paper).toBe('#101820')
  expect(design.accent).toBe('#ff694a')
  expect(design.ink).toBe('#f2efe7')
  expect(design.bodyFont).toContain('Atkinson')

  const introAccent = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'race-intro-go'
    document.body.append(el)
    const value = getComputedStyle(el).color
    el.remove()
    return value
  })
  expect(introAccent).toBe('rgb(255, 105, 74)')

  for (const width of [320, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow, `Race Signal shell at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('Race Signal reduced motion removes decorative animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const running = await page.evaluate(() =>
    document.body.getAnimations({ subtree: true })
      .filter(a => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 1)
      .length,
  )
  expect(running).toBe(0)
})
