import { STICKER_LAYOUTS, type StickerLayout } from './sticker-layouts'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'

export interface StickerRun {
  date: string
  title: string
  distanceKm?: number | null
  seconds?: number | null
  source: 'Manual' | 'Strava' | 'Upload'
}

export function stickerLines(run: StickerRun, units: Units) {
  const distance = run.distanceKm != null && run.distanceKm > 0 ? formatDistance(run.distanceKm, units) : null
  const time = run.seconds != null && run.seconds > 0 ? formatDuration(run.seconds) : null
  return { distance, time, pace: distance && time ? formatPace(run.seconds! / run.distanceKm!, units) : null }
}

/** Transparent margins let runners put their sticker over a photo in Stories. All metrics are actual, never targets. */
export async function renderRunSticker(run: StickerRun, units: Units, layout: StickerLayout = 'portrait'): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  const size = STICKER_LAYOUTS.find((option) => option.id === layout)!
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the sticker. Try saving it in another browser.')
  if (layout !== 'portrait') {
    paintHorizontal(ctx, run, units, layout === 'transparent')
    return pngOf(canvas)
  }
  const { distance, time, pace } = stickerLines(run, units)
  const ink = '#ffffff',
    muted = '#b8b8b8',
    lime = '#b4c7a8'
  const rounded = (x: number, y: number, w: number, h: number, radius: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius)
  }
  rounded(64, 64, 952, 1152, 64)
  ctx.fillStyle = '#111111f5'
  ctx.fill()
  ctx.strokeStyle = '#b4c7a855'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.save()
  rounded(64, 64, 952, 1152, 64)
  ctx.clip()
  const glow = ctx.createRadialGradient(880, 120, 10, 880, 120, 630)
  glow.addColorStop(0, '#b4c7a828')
  glow.addColorStop(1, '#b4c7a800')
  ctx.fillStyle = glow
  ctx.fillRect(64, 64, 952, 1152)
  ctx.strokeStyle = '#b4c7a820'
  ctx.lineWidth = 2
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.moveTo(650 + i * 48, 64)
    ctx.lineTo(320 + i * 48, 1216)
    ctx.stroke()
  }
  ctx.restore()
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = ink,
    family = 'Instrument Sans Variable, sans-serif',
    weight = '700',
  ) => {
    ctx.font = `${weight} ${size}px "${family.split(',')[0]}", ${family.split(',').slice(1).join(',') || 'sans-serif'}`
    ctx.fillStyle = color
    ctx.fillText(value, x, y)
  }
  text('TAPER', 126, 170, 54, ink, 'Instrument Serif, serif', '400')
  const wordWidth = ctx.measureText('TAPER').width
  text('DAY', 126 + wordWidth, 170, 54, lime, 'Instrument Serif, serif', '400')
  text('THE WORK. LOGGED.', 128, 248, 28, lime)
  const title = run.title.length > 38 ? `${run.title.slice(0, 35)}…` : run.title
  text(title, 128, 334, 42)
  text(formatDate(run.date, 'long').replace(/^\w+,? /, ''), 128, 387, 26, muted)
  text(distance ? 'DISTANCE' : 'RUN TIME', 128, 500, 25, muted)
  const hero = distance ? distance.split(' ')[0]! : (time ?? 'COMPLETED')
  let heroSize = 176
  ctx.font = `400 ${heroSize}px "Instrument Serif", serif`
  while (ctx.measureText(hero).width > 816 && heroSize > 70) {
    heroSize -= 4
    ctx.font = `400 ${heroSize}px "Instrument Serif", serif`
  }
  text(hero, 120, 685, heroSize, lime, 'Instrument Serif, serif', '400')
  if (distance) text(units.toUpperCase(), 134, 746, 40, lime)
  ctx.fillStyle = '#ffffff20'
  ctx.fillRect(128, 814, 824, 2)
  text(distance ? 'TIME' : 'DISTANCE', 128, 880, 24, muted)
  text(distance ? (time ?? 'Not recorded') : 'Not recorded', 128, 945, distance && time ? 54 : 34)
  text('AVERAGE PACE', 594, 880, 24, muted)
  text(pace ?? 'Not recorded', 594, 945, pace ? 48 : 34)
  ctx.fillStyle = lime
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(128 + i * 34, 1024)
    ctx.lineTo(147 + i * 34, 1024)
    ctx.lineTo(133 + i * 34, 1068)
    ctx.lineTo(114 + i * 34, 1068)
    ctx.fill()
  }
  text('taperday.run', 128, 1152, 27, muted)
  ctx.textAlign = 'right'
  text(run.source === 'Strava' ? 'Powered by Strava' : run.source === 'Manual' ? 'Manually logged' : 'Recorded run', 952, 1152, 24, muted)
  return pngOf(canvas)
}

function pngOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Your browser could not save this sticker.'))), 'image/png'),
  )
}

/** A wide composition, with a genuinely transparent alternative for layering over a runner's own photo. */
function paintHorizontal(ctx: CanvasRenderingContext2D, run: StickerRun, units: Units, transparent: boolean) {
  const { distance, time, pace } = stickerLines(run, units)
  const ink = '#ffffff',
    lime = '#b4c7a8',
    muted = transparent ? '#ffffff' : '#b8b8b8'
  const display = '"Instrument Serif", serif'
  const body = '"Instrument Sans Variable", sans-serif'
  if (!transparent) {
    ctx.beginPath()
    ctx.roundRect(48, 48, 1504, 804, 56)
    ctx.fillStyle = '#111111f5'
    ctx.fill()
    ctx.strokeStyle = '#b4c7a855'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.save()
    ctx.clip()
    const glow = ctx.createRadialGradient(1420, 100, 10, 1420, 100, 1000)
    glow.addColorStop(0, '#b4c7a828')
    glow.addColorStop(1, '#b4c7a800')
    ctx.fillStyle = glow
    ctx.fillRect(48, 48, 1504, 804)
    ctx.strokeStyle = '#b4c7a820'
    ctx.lineWidth = 2
    for (let i = 0; i < 10; i++) {
      ctx.beginPath()
      ctx.moveTo(1050 + i * 62, 48)
      ctx.lineTo(650 + i * 62, 852)
      ctx.stroke()
    }
    ctx.restore()
  }
  const text = (value: string, x: number, y: number, size: number, width: number, color = ink, family = body, weight = 700) => {
    ctx.save()
    ctx.font = `${weight} ${size}px ${family}`
    while (ctx.measureText(value).width > width && size > 20) {
      size -= 1
      ctx.font = `${weight} ${size}px ${family}`
    }
    if (transparent) {
      ctx.shadowColor = '#000000b0'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 3
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00000080'
      ctx.strokeText(value, x, y, width)
    }
    ctx.fillStyle = color
    ctx.fillText(value, x, y, width)
    ctx.restore()
  }
  const left = 112,
    right = 1488
  text('TAPER', left, 148, 54, 500, ink, display, 800)
  ctx.font = `800 54px ${display}`
  const logoWidth = ctx.measureText('TAPER').width
  text('DAY', left + logoWidth, 148, 54, 300, lime, display, 800)
  ctx.textAlign = 'right'
  text('THE WORK. LOGGED.', right, 148, 27, 650, lime)
  ctx.textAlign = 'left'
  text(run.title, left, transparent ? 226 : 258, transparent ? 40 : 52, right - left, ink, display, 800)

  const labelY = transparent ? 320 : 386
  const valueY = transparent ? 446 : 548
  const metrics = [
    { x: left, label: 'DISTANCE', value: distance, color: lime, size: 144 },
    { x: 608, label: 'TIME', value: time, color: ink, size: 108 },
    { x: 1104, label: 'AVERAGE PACE', value: pace, color: ink, size: 94 },
  ]
  for (const metric of metrics) {
    text(metric.label, metric.x, labelY, 26, 384, muted)
    text(metric.value ?? 'Not recorded', metric.x - 4, valueY, metric.value ? metric.size : 42, 396, metric.color, display, 800)
  }
  const dateY = transparent ? 560 : 700
  const footerY = transparent ? 626 : 790
  if (!transparent) {
    ctx.fillStyle = '#ffffff20'
    ctx.fillRect(left, 628, right - left, 2)
  }
  text(formatDate(run.date, 'long'), left, dateY, 32, 850, muted)
  ctx.textAlign = 'right'
  text(
    run.source === 'Strava' ? 'Powered by Strava' : run.source === 'Manual' ? 'Manually logged' : 'Recorded run',
    right,
    dateY,
    28,
    460,
    muted,
  )
  text('taperday.run', right, footerY, 27, 460, muted)
  ctx.textAlign = 'left'
  ctx.fillStyle = lime
  if (transparent) {
    ctx.shadowColor = '#000000a0'
    ctx.shadowBlur = 6
  }
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(left + i * 30, footerY - 30)
    ctx.lineTo(left + 16 + i * 30, footerY - 30)
    ctx.lineTo(left + 6 + i * 30, footerY + 2)
    ctx.lineTo(left - 10 + i * 30, footerY + 2)
    ctx.fill()
  }
}
