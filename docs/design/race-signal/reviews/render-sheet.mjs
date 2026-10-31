// Contact sheet: real screens, one row per accent. Usage: node sheet.mjs <outDir> [accents json]
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const out = process.argv[2]
const palettes = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const accents = Object.fromEntries(Object.entries(palettes).map(([k, v]) => [k, v.accent]))
const base = 'http://localhost:5199'
const plan = '/?km=21.1&date=2027-02-28&name=Hoka+Half&goal=6600&days=tu.th.sa.su&long=su&exp=regular&from=2026-11-02'
const screens = [
  { name: 'landing', url: '/' },
  
  { name: 'running', url: '/e2e/fixtures/run-history.html?date=2026-10-28&km=12', wait: '.home-tile' },
]
const sizes = [{ w: 390, h: 844 }, { w: 1440, h: 900 }]
const browser = await chromium.launch()
const shots = []
for (const [label, hex] of Object.entries(accents)) for (const s of screens) for (const z of sizes) {
  if (palettes[label].only && palettes[label].only !== s.name) continue
  const page = await browser.newPage({ viewport: { width: z.w, height: z.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await page.route('**/e2e/fixtures/**/api/**', r => r.fulfill({ json: [] }))
  if (s.url.startsWith('/e2e')) await page.route('**/api/v1/**', r => r.fulfill({ json: new URL(r.request().url()).pathname.endsWith('/coach') ? { id: 'qa', plan: JSON.parse(readFileSync('src/test/fixtures/plan-5k.json', 'utf8')), coaching: [] } : [] }))
  await page.goto(base + s.url, { waitUntil: 'networkidle' })
  if (s.wait) await page.locator(s.wait).first().waitFor({ timeout: 20000 }).catch(() => {})
  const p = palettes[label]
  if (p.css) await page.addStyleTag({ path: new URL(p.css, 'file:///' + process.argv[3]).pathname.slice(1) })
  else {
  const bleed = c => `background:${c};box-shadow:0 0 0 100vmax ${c};clip-path:inset(0 -100vmax)`
  await page.addStyleTag({ content: `:root{--paper:${p.bg};--surface:#ffffff;--surface-sunk:color-mix(in srgb,${p.ink} 8%,#fff);--ink:${p.ink};--accent:${p.accent};--on-accent:${p.onAccent};--accent-strong:color-mix(in srgb,${p.accent} 80%,#000)} body{background:${p.bg}} .masthead{${bleed(p.mast)};border-bottom-color:${p.ink}} .masthead *{color:${p.mastInk}} .intro.hero{${bleed(p.hero)};padding-block:2rem} .intro.hero h1,.intro.hero h1 em,.intro.hero p{color:${p.heroInk}} .countdown,.home-race-card{background:var(--pin-holes),${p.bib}!important} .ticker{background:${p.banner};color:${p.bannerInk}} .panel.home-card.home-today{background:${p.today}!important} .panel.home-card.home-week{background:${p.week}!important} *{animation:none!important;transition:none!important}` })
  }
  await page.addStyleTag({ content: `*{animation:none!important;transition:none!important}` })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  const file = `${out}/${label}-${s.name}-${z.w}.png`
  await page.screenshot({ path: file })
  shots.push({ label, screen: s.name, w: z.w, file })
  await page.close()
}
const rows = Object.keys(accents).map(l => `<h2>${l} ${accents[l]}</h2><div class=row>${shots.filter(s => s.label === l).map(s => `<figure><img src="file:///${s.file}" style="height:${s.w === 390 ? 420 : 300}px"><figcaption>${s.screen} ${s.w}</figcaption></figure>`).join('')}</div>`).join('')
writeFileSync(`${out}/sheet.html`, `<body style="margin:16px;font:14px system-ui;background:#888">${rows}<style>.row{display:flex;gap:8px;align-items:flex-start}figure{margin:0}img{display:block;border:1px solid #000}h2{margin:12px 0 6px}</style>`)
const page = await browser.newPage({ viewport: { width: 2600, height: 800 } })
await page.goto(`file:///${out}/sheet.html`)
await page.screenshot({ path: `${out}/contact-sheet.png`, fullPage: true })
await browser.close()
console.log(shots.length, 'frames')
