// A portrait (Story-sized) card for WhatsApp, Instagram or Strava: Night Run's near-black and volt, the runner with
// arms up, and only the numbers the runner chose to share. No dates of birth, places, routes or account details.

export interface CardContent {
  kicker: string
  heading: string
  raceName: string
  stats: { value: string; label: string }[]
  footer: string
}

const WIDTH = 1080
const HEIGHT = 1920
const INK = '#0a0a0b'
const VOLT = '#d7ff3e'
const LIGHT = '#f2f2f2'
const MUTED = '#9ea2aa'
const FONT = "'Instrument Sans Variable', 'Segoe UI', system-ui, sans-serif"

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Keeps a long race name on the card: shortened with an ellipsis, never overflowing it. */
export function fitText(value: string, max: number) {
  const text = value.trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The same card as SVG: for browsers without a canvas, and as text the card's words can be read from. */
export function cardSvg(content: CardContent): string {
  const stats = content.stats.slice(0, 3).map((stat, i) => {
    const y = 980 + i * 250
    return `<text x="96" y="${y}" fill="${VOLT}" font-family="${FONT}" font-size="132" font-weight="700">${escapeXml(stat.value)}</text>`
      + `<text x="96" y="${y + 64}" fill="${LIGHT}" font-family="${FONT}" font-size="38" letter-spacing="4">${escapeXml(stat.label.toUpperCase())}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`${content.heading}. ${content.raceName}. ${content.stats.map(s => `${s.value} ${s.label}`).join(', ')}`)}">`
    + `<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>`
    + `<text x="96" y="170" fill="${VOLT}" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="8">${escapeXml(content.kicker)}</text>`
    + `<g transform="translate(780 230) scale(3)" fill="none" stroke="${VOLT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="10" r="8" fill="${VOLT}" stroke="none"/><path d="M30 21 L30 46"/><path d="M30 26 L16 8"/><path d="M30 26 L44 8"/><path d="M30 46 L22 76"/><path d="M30 46 L38 76"/></g>`
    + `<text x="96" y="560" fill="${LIGHT}" font-family="${FONT}" font-size="118" font-weight="700">${escapeXml(content.heading)}</text>`
    + `<text x="96" y="650" fill="${LIGHT}" font-family="${FONT}" font-size="48">${escapeXml(fitText(content.raceName, 34))}</text>`
    + `<path d="M96 740 H984" stroke="${VOLT}" stroke-width="8" stroke-dasharray="36 18"/>`
    + stats
    + `<text x="96" y="1800" fill="${MUTED}" font-family="${FONT}" font-size="38">${escapeXml(content.footer)}</text>`
    + '</svg>'
}

function drawRunner(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  context.save()
  context.translate(x, y)
  context.scale(scale, scale)
  context.strokeStyle = VOLT
  context.fillStyle = VOLT
  context.lineWidth = 6
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.arc(30, 10, 8, 0, Math.PI * 2)
  context.fill()
  for (const [x1, y1, x2, y2] of [[30, 21, 30, 46], [30, 26, 16, 8], [30, 26, 44, 8], [30, 46, 22, 76], [30, 46, 38, 76]] as const) {
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
  }
  context.restore()
}

/** The card as a PNG, drawn on a canvas. Null where the browser can't draw one (the SVG is used instead). */
export async function cardPng(content: CardContent): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!context) return null
  try {
    await document.fonts?.ready
  } catch {
    // The system font is fine.
  }
  context.fillStyle = INK
  context.fillRect(0, 0, WIDTH, HEIGHT)
  context.textBaseline = 'alphabetic'
  context.fillStyle = VOLT
  context.font = `700 40px ${FONT}`
  context.fillText(content.kicker, 96, 170)
  drawRunner(context, 780, 230, 3)
  context.fillStyle = LIGHT
  context.font = `700 118px ${FONT}`
  context.fillText(content.heading, 96, 560, WIDTH - 192)
  context.font = `48px ${FONT}`
  context.fillText(fitText(content.raceName, 34), 96, 650, WIDTH - 192)
  context.strokeStyle = VOLT
  context.lineWidth = 8
  context.setLineDash([36, 18])
  context.beginPath()
  context.moveTo(96, 740)
  context.lineTo(984, 740)
  context.stroke()
  context.setLineDash([])
  content.stats.slice(0, 3).forEach((stat, i) => {
    const y = 980 + i * 250
    context.fillStyle = VOLT
    context.font = `700 132px ${FONT}`
    context.fillText(stat.value, 96, y, WIDTH - 192)
    context.fillStyle = LIGHT
    context.font = `38px ${FONT}`
    context.fillText(stat.label.toUpperCase(), 96, y + 64, WIDTH - 192)
  })
  context.fillStyle = MUTED
  context.font = `38px ${FONT}`
  context.fillText(content.footer, 96, 1800, WIDTH - 192)
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked after the click has been handled, so Safari still has the file to save.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Saves the card: a PNG where the browser can draw one, otherwise the SVG. Says which. */
export async function downloadCard(content: CardContent, baseName: string): Promise<'png' | 'svg'> {
  const png = await cardPng(content)
  if (png) {
    save(png, `${baseName}.png`)
    return 'png'
  }
  save(new Blob([cardSvg(content)], { type: 'image/svg+xml' }), `${baseName}.svg`)
  return 'svg'
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable'

/** The phone's share sheet with the picture where it can take files, then words only, then the clipboard. */
export async function shareCard(content: CardContent, text: string, baseName: string): Promise<ShareOutcome> {
  const title = `${content.heading} · Taperday`
  if (typeof navigator.share === 'function') {
    try {
      const png = await cardPng(content)
      const file = png && typeof File === 'function' ? new File([png], `${baseName}.png`, { type: 'image/png' }) : null
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, title })
      else await navigator.share({ text, title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'unavailable'
  }
}
