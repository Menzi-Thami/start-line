import type { Milestone } from './milestones'

export interface MilestoneCardOptions {
  showDate?: boolean
  showBrand?: boolean
  displayName?: string
}

/** Produces a sharable image, intentionally not embedding source names, GPS, HR or raw activities. */
export async function renderMilestoneCard(milestone: Milestone, options: MilestoneCardOptions = {}): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image creation is unavailable in this browser.')
  const { width: w, height: h } = canvas
  ctx.fillStyle = '#e4e4e4'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(44, 44, w - 88, h - 88, 48)
  ctx.fill()
  ctx.fillStyle = '#b4c7a8'
  ctx.beginPath()
  ctx.roundRect(90, 116, w - 180, 96, 34)
  ctx.fill()
  const write = (text: string, x: number, y: number, size: number, color: string, family = 'Instrument Sans Variable, sans-serif', weight = '600') => {
    ctx.fillStyle = color
    ctx.font = `${weight} ${size}px ${family}`
    ctx.fillText(text, x, y)
  }
  write('YOUR RUNNING STORY', 140, 180, 30, '#111111')
  if (options.showBrand !== false) write('taperday', 130, 330, 74, '#111111', 'Instrument Serif, Georgia, serif', '400')
  const value = String(milestone.value)
  let fontSize = 252
  ctx.font = `400 ${fontSize}px "Instrument Serif", Georgia, serif`
  while (ctx.measureText(value).width > 740 && fontSize > 90) {
    fontSize -= 8
    ctx.font = `400 ${fontSize}px "Instrument Serif", Georgia, serif`
  }
  write(value, 130, 670, fontSize, '#4f6f45', '"Instrument Serif", Georgia, serif', '400')
  write(milestone.unit.toUpperCase(), 140, 755, 52, '#111111')
  // Long lines wrap within the safe margins of a phone story card.
  const words = milestone.title.split(/\s+/)
  let line = ''
  let y = 866
  for (const word of words) {
    ctx.font = '600 48px "Instrument Sans Variable", sans-serif'
    const proposed = line ? `${line} ${word}` : word
    if (ctx.measureText(proposed).width > 790 && line) {
      write(line, 130, y, 48, '#111111')
      y += 64
      line = word
    } else line = proposed
  }
  if (line) write(line, 130, y, 48, '#111111')
  const name = options.displayName?.trim()
  if (name) write(name.slice(0, 36), 130, 1130, 35, '#3a3a3a')
  write('Based on available recorded runs', 130, 1200, 27, '#666666', 'Instrument Sans Variable, sans-serif', '400')
  if (options.showBrand !== false) write('taperday.run', 130, 1250, 27, '#4f6f45')
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(new Error('Could not save the milestone image.')), 'image/png'))
}
