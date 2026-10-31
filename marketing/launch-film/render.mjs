// Renders film.html frame by frame. From the repo root:
//   node marketing/launch-film/render.mjs --sheet           contact sheet of stills, both formats
//   node marketing/launch-film/render.mjs --poster          poster PNGs
//   node marketing/launch-film/render.mjs --film [v|w]      the MP4s (needs ffmpeg: see README.md)
//   node marketing/launch-film/render.mjs --loop            last and first frames side by side
//   node marketing/launch-film/render.mjs --at 6.4,7.4      full-size stills into stills/, for a closer look
// The page is served from the repo root so it can use the app's own fonts and photo.
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const { chromium } = await import(pathToFileURL(resolve(root, 'client/node_modules/@playwright/test/index.mjs')).href)
const args = process.argv.slice(2)
const FORMATS = { v: { width: 1080, height: 1920 }, w: { width: 1920, height: 1080 } }
const SHEET_TIMES = [0.6, 2.2, 3.5, 5.0, 6.0, 7.0, 7.9, 9.3, 10.6, 12.2, 13.6, 15.6, 16.9]
const POSTER_T = 2.2

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!path.startsWith(root + sep)) return res.writeHead(403).end()
  try {
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((ok) => server.listen(5202, '127.0.0.1', ok))
const browser = await chromium.launch()

async function open(format) {
  const page = await browser.newPage({ viewport: FORMATS[format], deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(`http://127.0.0.1:5202/marketing/launch-film/film.html?format=${format}`)
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 })
  return page
}
async function still(page, t, type = 'png') {
  await page.evaluate((t) => window.seek(t), t)
  return page.screenshot({ type, ...(type === 'jpeg' ? { quality: 92 } : {}) })
}

/** Lays stills out on one page and screenshots it. rows: [{ label, shots: [{ caption, png, h }] }] */
async function sheet(rows, file) {
  const html = `<body style="margin:24px;font:16px system-ui;background:#2b2b2b;color:#eee">${rows.map((r) => `<h2 style="margin:18px 0 8px;font-weight:600">${r.label}</h2><div style="display:flex;gap:10px;flex-wrap:wrap">${r.shots.map((s) => `<figure style="margin:0"><img style="display:block;height:${s.h}px;border:1px solid #000" src="data:image/png;base64,${s.png.toString('base64')}"><figcaption style="margin-top:4px">${s.caption}</figcaption></figure>`).join('')}</div>`).join('')}</body>`
  const page = await browser.newPage({ viewport: { width: 2400, height: 900 } })
  await page.setContent(html)
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

if (args.includes('--sheet')) {
  const rows = []
  for (const format of ['v', 'w']) {
    const page = await open(format)
    const shots = []
    for (const t of SHEET_TIMES) shots.push({ caption: `${t.toFixed(1)} s`, png: await still(page, t), h: format === 'v' ? 520 : 225 })
    rows.push({ label: format === 'v' ? 'Vertical 1080x1920' : 'Wide 1920x1080', shots })
    await page.close()
  }
  await sheet(rows, resolve(here, 'contact-sheet.png'))
  console.log('contact-sheet.png')
}

const atAt = args.indexOf('--at')
if (atAt !== -1) {
  await mkdir(resolve(here, 'stills'), { recursive: true })
  for (const format of ['v', 'w']) {
    const page = await open(format)
    for (const t of args[atAt + 1].split(',').map(Number)) await writeFile(resolve(here, `stills/${format}-${t.toFixed(2)}.png`), await still(page, t))
    await page.close()
  }
  console.log('stills/')
}

if (args.includes('--poster')) {
  for (const format of ['v', 'w']) {
    const page = await open(format)
    await writeFile(resolve(here, `poster-${format === 'v' ? 'vertical' : 'wide'}.png`), await still(page, POSTER_T))
    await page.close()
  }
  console.log('posters at', POSTER_T, 's')
}

if (args.includes('--loop')) {
  const rows = []
  for (const format of ['v', 'w']) {
    const page = await open(format)
    const fps = await page.evaluate(() => window.FPS), last = (await page.evaluate(() => window.DURATION)) * fps - 1
    const h = format === 'v' ? 640 : 300
    rows.push({ label: `${format === 'v' ? 'Vertical' : 'Wide'}: last frame, then first`, shots: [
      { caption: `frame ${last}`, png: await still(page, last / fps), h },
      { caption: 'frame 0', png: await still(page, 0), h },
      { caption: 'frame 1', png: await still(page, 1 / fps), h },
    ] })
    await page.close()
  }
  await sheet(rows, resolve(here, 'loop-check.png'))
  console.log('loop-check.png')
}

const filmAt = args.indexOf('--film')
if (filmAt !== -1) {
  const only = args[filmAt + 1]
  // FFMPEG overrides; otherwise the film folder's own ffmpeg (npm install here), then one on the PATH.
  const ffmpeg = process.env.FFMPEG ?? (await import('@ffmpeg-installer/ffmpeg').then((m) => m.default.path).catch(() => 'ffmpeg'))
  for (const format of only in FORMATS ? [only] : ['v', 'w']) {
    const page = await open(format)
    const fps = await page.evaluate(() => window.FPS), frames = (await page.evaluate(() => window.DURATION)) * fps
    const out = resolve(here, `taperday-launch-${format === 'v' ? 'vertical' : 'wide'}.mp4`)
    const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
    const done = new Promise((ok, fail) => enc.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))))
    for (let i = 0; i < frames; i++) {
      const png = await still(page, i / fps)
      if (!enc.stdin.write(png)) await new Promise((ok) => enc.stdin.once('drain', ok))
      if (i % 60 === 0) process.stdout.write(`${format} ${i}/${frames}\n`)
    }
    enc.stdin.end()
    await done
    await page.close()
    console.log(out)
  }
}

await browser.close()
server.close()
