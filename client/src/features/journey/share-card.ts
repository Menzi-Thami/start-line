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

/** Two readable lines keep metric labels whole instead of squeezing or cutting off their meaning. */
function labelLines(value: string): string[] {
  const words = value.toUpperCase().trim().split(/\s+/)
  let first = words.shift() ?? ''
  while (words.length && `${first} ${words[0]}`.length <= 21) first += ` ${words.shift()}`
  return words.length ? [fitText(first, 21), fitText(words.join(' '), 24)] : [fitText(first, 24)]
}

/** A Night Run poster rather than a table: track lines, race mark, runner, a hero stat and two split cards.
 * Safe SVG fallback uses exactly the same facts as the downloadable PNG.
 */
export function cardSvg(content: CardContent): string {
  const first = content.stats[0]
  const second = content.stats[1]
  const third = content.stats[2]
  const text = (value: string, x: number, y: number, size: number, color: string, weight = 700, extra = '', maxWidth = 888) => {
    const spacing = Number(extra.match(/letter-spacing="(-?[\d.]+)"/)?.[1] ?? 0)
    // SVG has no canvas fillText(maxWidth). Bound long lines for fallback fonts as well as the brand font.
    const fit = value.length * (size * .75 + spacing) > maxWidth ? `textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''
    return `<text x="${x}" y="${y}" fill="${color}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" ${extra} ${fit}>${escapeXml(value)}</text>`
  }
  const stat = (value: { value: string; label: string } | undefined, x: number) => !value ? '' :
    '<rect x="' + x + '" y="1260" width="425" height="280" rx="28" fill="#181b1d" stroke="#3a4042" stroke-width="2"/>'
    + text(fitText(value.value, 12), x + 36, 1390, value.value.length > 8 ? 66 : 98, LIGHT, 700, '', 353)
    + labelLines(value.label).map((line, i) => text(line, x + 36, 1458 + i * 34, 24, MUTED, 600, 'letter-spacing="1"', 353)).join('')
  const bigSize = first?.value.length && first.value.length > 9 ? 130 : 193
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`${content.heading}. ${content.raceName}. ${content.stats.map(s => `${s.value} ${s.label}`).join(', ')}`)}">`
    + `<defs><linearGradient id="td-night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171b1b"/><stop offset=".58" stop-color="${INK}"/><stop offset="1" stop-color="#171a16"/></linearGradient></defs>`
    + '<rect width="1080" height="1920" fill="url(#td-night)"/>'
    + `<path d="M710 -100 C1250 330 450 600 1120 1050" stroke="${VOLT}" stroke-opacity=".1" stroke-width="230" fill="none"/>`
    + `<path d="M790 -100 C1320 330 530 600 1200 1050" stroke="${VOLT}" stroke-opacity=".35" stroke-width="3" fill="none" stroke-dasharray="20 22"/>`
    + '<rect x="78" y="82" width="924" height="1760" rx="36" fill="none" stroke="#404449" stroke-width="2"/>'
    + '<rect x="96" y="115" width="28" height="28" rx="6" fill="' + VOLT + '"/>'
    + text('TAPERDAY', 147, 140, 44, LIGHT, 800, 'letter-spacing="5"')
    + text(fitText(content.kicker.toUpperCase(), 32), 96, 255, 29, VOLT, 750, 'letter-spacing="3"')
    + `<g transform="translate(760 190) scale(3.2)" fill="none" stroke="${VOLT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="10" r="8" fill="${VOLT}" stroke="none"/><path d="M30 21 L30 46"/><path d="M30 26 L16 8"/><path d="M30 26 L44 8"/><path d="M30 46 L22 76"/><path d="M30 46 L38 76"/></g>`
    + text(fitText(content.heading, 22), 96, 570, 93, LIGHT, 800, 'letter-spacing="-2"')
    + text(fitText(content.raceName, 31), 96, 655, 44, MUTED, 600)
    + '<rect x="96" y="735" width="888" height="7" rx="4" fill="' + VOLT + '"/>'
    + text(first ? fitText(first.value, 13) : '—', 96, 1040, bigSize, VOLT, 800, 'letter-spacing="-6"')
    + text(first ? fitText(first.label.toUpperCase(), 35) : '', 98, 1115, 35, LIGHT, 650, 'letter-spacing="3"')
    + stat(second, 96) + stat(third, 559)
    + '<path d="M96 1670 H984" stroke="#404449" stroke-width="2"/>'
    + text(fitText(content.footer, 53), 96, 1770, 29, MUTED, 600)
    + text('KEEP RUNNING.', 96, 1820, 36, VOLT, 800, 'letter-spacing="7"')
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

/** A high-resolution portrait PNG; the canvas layout mirrors cardSvg. */
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
  try { await document.fonts?.ready } catch { /* System fonts are fine. */ }

  const bg = context.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bg.addColorStop(0, '#171b1b')
  bg.addColorStop(.58, INK)
  bg.addColorStop(1, '#171a16')
  context.fillStyle = bg
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.save()
  context.strokeStyle = VOLT
  context.globalAlpha = .1
  context.lineWidth = 230
  context.beginPath()
  context.moveTo(710, -100)
  context.bezierCurveTo(1250, 330, 450, 600, 1120, 1050)
  context.stroke()
  context.globalAlpha = .35
  context.lineWidth = 3
  context.setLineDash([20, 22])
  context.beginPath()
  context.moveTo(790, -100)
  context.bezierCurveTo(1320, 330, 530, 600, 1200, 1050)
  context.stroke()
  context.restore()

  context.strokeStyle = '#404449'
  context.lineWidth = 2
  context.beginPath()
  context.roundRect(78, 82, 924, 1760, 36)
  context.stroke()
  context.fillStyle = VOLT
  context.beginPath()
  context.roundRect(96, 115, 28, 28, 6)
  context.fill()

  const write = (value: string, x: number, y: number, fontSize: number, color: string, weight = 700, maxWidth = 888) => {
    context.fillStyle = color
    context.font = `${weight} ${fontSize}px ${FONT}`
    context.fillText(value, x, y, maxWidth)
  }
  context.textBaseline = 'alphabetic'
  write('TAPERDAY', 147, 140, 44, LIGHT, 800)
  write(fitText(content.kicker.toUpperCase(), 32), 96, 255, 29, VOLT, 750)
  drawRunner(context, 760, 190, 3.2)
  write(fitText(content.heading, 22), 96, 570, 93, LIGHT, 800)
  write(fitText(content.raceName, 31), 96, 655, 44, MUTED, 600)

  context.fillStyle = VOLT
  context.beginPath()
  context.roundRect(96, 735, 888, 7, 4)
  context.fill()
  const first = content.stats[0]
  write(first ? fitText(first.value, 13) : '—', 96, 1040, first?.value.length && first.value.length > 9 ? 130 : 193, VOLT, 800)
  if (first) write(fitText(first.label.toUpperCase(), 35), 98, 1115, 35, LIGHT, 650)
  for (const [i, x] of [96, 559].entries()) {
    const item = content.stats[i + 1]
    if (!item) continue
    context.fillStyle = '#181b1d'
    context.beginPath()
    context.roundRect(x, 1260, 425, 280, 28)
    context.fill()
    context.strokeStyle = '#3a4042'
    context.lineWidth = 2
    context.stroke()
    write(fitText(item.value, 12), x + 36, 1390, item.value.length > 8 ? 66 : 98, LIGHT, 700, 360)
    labelLines(item.label).forEach((line, i) => write(line, x + 36, 1458 + i * 34, 24, MUTED, 600, 353))
  }
  context.strokeStyle = '#404449'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(96, 1670)
  context.lineTo(984, 1670)
  context.stroke()
  write(fitText(content.footer, 53), 96, 1770, 29, MUTED, 600)
  write('KEEP RUNNING.', 96, 1820, 36, VOLT, 800)
  return new Promise(resolve => {
    try { canvas.toBlob(blob => resolve(blob), 'image/png') }
    catch { resolve(null) }
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

/** Prepare before the tap: Safari requires navigator.share to be called during the original user gesture. */
export async function prepareCard(content: CardContent, baseName: string): Promise<File | null> {
  const png = await cardPng(content)
  return png && typeof File === 'function' ? new File([png], `${baseName}.png`, { type: 'image/png' }) : null
}

/** The phone's share sheet with the picture where it can take files, then words only, then the clipboard. */
export async function shareCard(content: CardContent, text: string, baseName: string, prepared?: File | null): Promise<ShareOutcome> {
  const title = `${content.heading} · Taperday`
  if (typeof navigator.share === 'function') {
    try {
      const file = prepared === undefined ? await prepareCard(content, baseName) : prepared
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
