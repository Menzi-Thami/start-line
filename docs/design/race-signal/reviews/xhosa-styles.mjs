// Writes the two Xhosa-inspired review styles: beadwork bands (SVG tiles) and umbhaco braid stripes.
import { writeFileSync } from 'node:fs'
const dir = 'C:/Users/ThamsanqaMenzi/AppData/Local/Temp/slrs/docs/design/race-signal/reviews/'
const c = { white: '#ffffff', black: '#111111', turq: '#1fa6b8', red: '#c8102e', yellow: '#f5c400', navy: '#1d2a6b', ochre: '#d9772b' }
const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
// Zigzag of bead triangles, as on a beaded band.
const zigzag = uri(`<svg xmlns='http://www.w3.org/2000/svg' width='48' height='16' viewBox='0 0 48 16'><rect width='48' height='16' fill='${c.white}'/>`
  + `<polygon points='0,16 8,0 16,16' fill='${c.turq}'/><polygon points='16,16 24,0 32,16' fill='${c.red}'/><polygon points='32,16 40,0 48,16' fill='${c.yellow}'/>`
  + `<polygon points='8,0 16,16 24,0' fill='${c.black}'/><polygon points='24,0 32,16 40,0' fill='${c.navy}'/><polygon points='40,0 48,16 48,0' fill='${c.black}'/><polygon points='0,0 0,16 8,0' fill='${c.black}'/></svg>`)
// Diamonds within diamonds on black.
const diamond = uri(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='${c.black}'/>`
  + `<polygon points='20,2 38,20 20,38 2,20' fill='${c.white}'/><polygon points='20,9 31,20 20,31 9,20' fill='${c.turq}'/><polygon points='20,15 25,20 20,25 15,20' fill='${c.red}'/>`
  + `<polygon points='0,0 6,0 0,6' fill='${c.yellow}'/><polygon points='40,0 34,0 40,6' fill='${c.yellow}'/><polygon points='0,40 6,40 0,34' fill='${c.yellow}'/><polygon points='40,40 34,40 40,34' fill='${c.yellow}'/></svg>`)
// Umbhaco: parallel black braid bands.
const braid = (ground) => `repeating-linear-gradient(0deg, ${ground} 0 14px, ${c.black} 14px 18px, ${ground} 18px 22px, ${c.black} 22px 24px)`
const bleed = (bg) => `isolation: isolate; } .intro.hero::before { content: ''; position: absolute; z-index: -1; inset-block: 0; left: calc(50% - 50vw); width: 100vw; background: ${bg};`
const common = `
:root { --paper: ${c.white}; --ink: ${c.black}; --accent: ${c.red}; --on-accent: #fff; --line: #111111; }
body { background: var(--paper); }
.masthead { background: #fff; border-bottom: 0; box-shadow: 0 0 0 100vmax #fff; clip-path: inset(0 -100vmax -16px); }
.masthead::after { content: ''; position: absolute; left: calc(50% - 50vw); width: 100vw; bottom: -16px; height: 16px; background: ${zigzag} 0 0 / 48px 16px repeat-x; }
.masthead { position: relative; margin-bottom: 16px; }
.wordmark-accent { color: ${c.red} !important; }
.countdown, .home-race-card { background: var(--pin-holes), #fff !important; border: 3px solid ${c.black}; }
.countdown::before, .home-race-card::before { height: 14px !important; background: ${zigzag} 0 0 / 42px 14px repeat-x !important; }
.countdown-fill { stroke: ${c.red}; }
.countdown-track { stroke: #e7e7e7; }
.ticker { background: ${c.black}; color: #fff; border-block: 8px solid transparent; border-image: ${zigzag} 0 0 0 0 / 0; box-shadow: 0 -10px 0 ${c.yellow}, 0 10px 0 ${c.turq}; margin-block: 10px; }
.panel.home-card.home-today { background: ${c.turq} !important; border: 3px solid ${c.black}; }
.panel.home-card.home-week { background: #fff !important; border: 3px solid ${c.black}; box-shadow: inset 0 -10px 0 ${c.yellow}; }
.panel.home-card.home-today, .panel.home-card.home-today *:not(.button):not(.button *) { color: ${c.black} !important; }
/* Very bold: the home page sits on a full-bleed field with beadwork bands above and below. */
.home-panel.home-focus { position: relative; isolation: isolate; padding-block: 28px; }
.home-panel.home-focus::before { content: ''; position: absolute; z-index: -1; inset-block: 0; left: calc(50% - 50vw); width: 100vw; background: ${zigzag} 0 0 / 48px 16px repeat-x, ${zigzag} 0 100% / 48px 16px repeat-x, var(--home-field); }
.home-panel.home-focus .home-section { background: #fff; border: 3px solid ${c.black}; padding: 16px; }
.masthead { background: ${c.black}; box-shadow: 0 0 0 100vmax ${c.black}; }
.masthead, .masthead * { color: #fff; }
.wordmark-accent { color: ${c.yellow} !important; }
.intro.hero h1 { font-size: clamp(2.8rem, 1rem + 6vw, 6.6rem); }
`
writeFileSync(dir + 'xhosa-umbhaco.css', `/* Xhosa-inspired, Umbhaco very bold: ochre cloth with black braid bands behind the hero; beadwork bands as trims. */${common}
:root { --home-field: ${c.ochre}; }
.panel.home-card.home-week { background: ${c.yellow} !important; }
.intro.hero { padding-block: 2.5rem 4rem; background: none; ${bleed(`${braid(c.ochre)} bottom / 100% 72px no-repeat, ${c.ochre}`)} }
.intro.hero h1, .intro.hero h1 em { color: ${c.black}; }
.intro.hero p { color: ${c.black}; }
`)
writeFileSync(dir + 'xhosa-beadwork.css', `/* Xhosa-inspired, Beadwork: a field of beaded diamonds behind the bib; white page, black type, bead colours. */${common}
:root { --home-field: ${diamond} 0 0 / 40px 40px; }
.home-panel.home-focus::before { background: ${diamond} 0 0 / 40px 40px; }
.intro.hero { padding-block: 2.5rem 3rem; background: none; ${bleed(`linear-gradient(90deg, #fff 0 60%, ${c.black} 60% calc(60% + 8px), transparent calc(60% + 8px)), ${diamond} 0 0 / 40px 40px`)} }
@media (max-width: 47.99rem) { .intro.hero::before { background: linear-gradient(180deg, #fff 0 52%, ${c.black} 52% calc(52% + 8px), transparent calc(52% + 8px)), ${diamond} 0 0 / 40px 40px; } }
.intro.hero h1 { color: ${c.black}; }
.intro.hero h1 em { color: ${c.red}; }
.intro.hero p { color: #333; }
.countdown { box-shadow: 10px 10px 0 ${c.black}; }
`)
writeFileSync(dir + 'palettes-xhosa.json', JSON.stringify({ 'Umbhaco very bold': { css: 'xhosa-umbhaco.css', accent: c.red }, 'Beadwork very bold': { css: 'xhosa-beadwork.css', accent: c.red } }, null, 2))
console.log('ok')
