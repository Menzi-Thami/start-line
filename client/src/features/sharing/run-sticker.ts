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
export async function renderRunSticker(run: StickerRun, units: Units): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1280
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the sticker. Try saving it in another browser.')
  const { distance, time, pace } = stickerLines(run, units)
  const ink = '#f4f5ed',
    muted = '#aab0a1',
    lime = '#d6ff32'
  const rounded = (x: number, y: number, w: number, h: number, radius: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius)
  }
  rounded(64, 64, 952, 1152, 64)
  ctx.fillStyle = '#10130ff5'
  ctx.fill()
  ctx.strokeStyle = '#d6ff3255'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.save()
  rounded(64, 64, 952, 1152, 64)
  ctx.clip()
  const glow = ctx.createRadialGradient(880, 120, 10, 880, 120, 630)
  glow.addColorStop(0, '#d6ff3228')
  glow.addColorStop(1, '#d6ff3200')
  ctx.fillStyle = glow
  ctx.fillRect(64, 64, 952, 1152)
  ctx.strokeStyle = '#d6ff3220'
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
    family = 'Atkinson Hyperlegible Next, sans-serif',
    weight = '700',
  ) => {
    ctx.font = `${weight} ${size}px "${family.split(',')[0]}", ${family.split(',').slice(1).join(',') || 'sans-serif'}`
    ctx.fillStyle = color
    ctx.fillText(value, x, y)
  }
  text('TAPER', 126, 170, 54, ink, 'Bricolage Grotesque Variable, sans-serif', '800')
  const wordWidth = ctx.measureText('TAPER').width
  text('DAY', 126 + wordWidth, 170, 54, lime, 'Bricolage Grotesque Variable, sans-serif', '800')
  text('THE WORK. LOGGED.', 128, 248, 28, lime)
  const title = run.title.length > 38 ? `${run.title.slice(0, 35)}…` : run.title
  text(title, 128, 334, 42)
  text(formatDate(run.date, 'long').replace(/^\w+,? /, ''), 128, 387, 26, muted)
  text(distance ? 'DISTANCE' : 'RUN TIME', 128, 500, 25, muted)
  const hero = distance ? distance.split(' ')[0]! : (time ?? 'COMPLETED')
  let heroSize = 176
  ctx.font = `800 ${heroSize}px "Bricolage Grotesque Variable", sans-serif`
  while (ctx.measureText(hero).width > 816 && heroSize > 70) {
    heroSize -= 4
    ctx.font = `800 ${heroSize}px "Bricolage Grotesque Variable", sans-serif`
  }
  text(hero, 120, 685, heroSize, lime, 'Bricolage Grotesque Variable, sans-serif', '800')
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
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Your browser could not save this sticker.'))), 'image/png'),
  )
}
