// Spelling and copy check for everything a runner reads: the app's screens, dialogs, errors, notifications and emails.
//
//   node tools/copy-check/copy-check.mjs          (from the repository root, after npm ci in tools/copy-check)
//
// Two layers, both on copy only (see extract.mjs), never on identifiers:
//   1. House style: British/South African spellings, doubled words, leftover placeholders, spacing, apostrophes.
//   2. cspell 10.4.0 (pinned in package-lock.json) with British English and the reviewed words.txt: product, race
//      and running words. Add a word only after checking it is right; never to silence a real misspelling.
// Nothing is corrected automatically. Race names, brands and anything a runner typed come from data, not source,
// so they are never checked or changed here.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractCSharp, extractTypeScript } from './extract.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

// Where the copy lives. Tests, generated API types, migrations and test-only fixtures are not shown to runners.
const SOURCES = [
  { dir: 'client/src', ext: /\.(ts|tsx)$/, skip: /(\.test\.|[\\/]test[\\/]|api-schema\.ts$|\.d\.ts$)/ },
  { dir: 'src', ext: /\.cs$/, skip: /([\\/]Migrations[\\/]|[\\/]obj[\\/]|[\\/]bin[\\/])/ },
]

// American spellings and their British forms. Whole words, any case. Reviewed list: add a pair only when the
// British form is the one Taperday uses everywhere.
const pairs = [
  ['colors?|colored|colorful', 'colour'], ['favorites?|favorited', 'favourite'], ['centers?|centered', 'centre'],
  ['kilometers?', 'kilometre'], ['meters', 'metres'], ['programs', 'programmes'], ['program', 'programme'],
  ['canceled|canceling', 'cancelled / cancelling'], ['labeled|labeling', 'labelled / labelling'],
  ['traveled|traveling', 'travelled / travelling'], ['modeled|modeling', 'modelled / modelling'],
  ['behaviors?', 'behaviour'], ['honors?|honored', 'honour'], ['gray', 'grey'], ['catalogs?', 'catalogue'],
  ['defense', 'defence'], ['practicing', 'practising'], ['toward', 'towards'], ['e-mails?', 'email'],
  ['analyze[sd]?|analyzing', 'analyse'],
  ['(?:organ|personal|recogn|real|optim|custom|priorit|minim|maxim|summar|apolog|special|standard|emphas|categor|memor|visual|synchron|author|util|final|normal|stabil|energ|mobil|maxim)iz(?:e|es|ed|ing|ation|ations)', '-ise / -isation'],
]
export const BRITISH = pairs.map(([us, gb]) => [new RegExp(`\\b(${us})\\b`, 'i'), gb])

// Other products' own labels, quoted as the runner will see them in that product. Only the label is exempt.
const QUOTED_LABELS = /\b(Training Center|Data Sharing and Authorization)\b/gi

const HOLE = /⁣N⁣/g

/** House-style problems in one copy segment: [{ rule, message }]. */
export function styleProblems(raw, { typographicApostrophe = true } = {}) {
  const text = raw.replace(HOLE, 'N')
  const own = text.replace(QUOTED_LABELS, '')
  const problems = []
  for (const [pattern, gb] of BRITISH) {
    const match = pattern.exec(own)
    if (match) problems.push({ rule: 'british', message: `"${match[1]}": use ${gb}` })
  }
  const doubled = /\b([A-Za-z]{2,})\s+\1\b/i.exec(text)
  if (doubled && !/^(had|that|is|very|so|bye|no|go|far)$/i.test(doubled[1])) problems.push({ rule: 'doubled-word', message: `"${doubled[0]}"` })
  const leftover = /\b(undefined|NaN|lorem|ipsum|TODO|FIXME|TBD)\b|\[object Object\]/.exec(text)
  if (leftover) problems.push({ rule: 'placeholder', message: `"${leftover[0]}" in copy` })
  if (/\S {2,}\S/.test(text)) problems.push({ rule: 'spacing', message: 'two spaces in a row' })
  // "?" and "!" are left out: copy sometimes names a marker, as in "Days marked ? are optional".
  const beforePunct = /\w \s*([,.;:])(?=\s|$)/.exec(text)
  if (beforePunct) problems.push({ rule: 'spacing', message: `space before "${beforePunct[1]}"` })
  if (/[.!?,]{2,}/.test(text.replace(/\.\.\./g, '').replace(/\?!|!\?/g, ''))) problems.push({ rule: 'punctuation', message: 'doubled punctuation' })
  // The app's screens use the typographic apostrophe (’); a straight one in a contraction or possessive is a slip.
  // API text keeps its straight apostrophes: version 1 plan text is hashed (GeneratorV1SnapshotTests) and emails
  // carry a plain-text part, so it is not checked for this.
  const straight = typographicApostrophe && /[A-Za-z]'(?:s|t|re|ve|ll|d|m)\b/.exec(text)
  if (straight) problems.push({ rule: 'apostrophe', message: `"${straight[0]}": use ’` })
  // "1 runs", "1 weeks": a fixed number with the wrong plural.
  const plural = /\b1 (runs|weeks|days|sessions|minutes|hours|kilometres|races|plans|shoes|check-ins|workouts|times)\b/.exec(text)
  if (plural) problems.push({ rule: 'plural', message: `"${plural[0]}"` })
  return problems
}

function walk(dir, ext, skip, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'bin' || name === 'obj') continue
    if (statSync(path).isDirectory()) walk(path, ext, skip, files)
    else if (ext.test(name) && !skip.test(path)) files.push(path)
  }
  return files
}

/** Every copy segment in the repository: [{ file, line, text, kind }]. */
export function collect() {
  const segments = []
  for (const { dir, ext, skip } of SOURCES) {
    for (const path of walk(join(root, dir), ext, skip)) {
      const source = readFileSync(path, 'utf8')
      const file = relative(root, path).split(sep).join('/')
      const found = path.endsWith('.cs') ? extractCSharp(source) : extractTypeScript(path, source)
      for (const s of found) segments.push({ file, ...s })
    }
  }
  return segments
}

export function runCspell(segments) {
  // A mirror of each file holding only its copy, line for line, so cspell's line numbers point at the source.
  const mirror = join(here, '.copy')
  rmSync(mirror, { recursive: true, force: true })
  const byFile = new Map()
  for (const s of segments) {
    const lines = byFile.get(s.file) ?? []
    lines[s.line - 1] = ((lines[s.line - 1] ?? '') + ' ' + s.text.replace(HOLE, ' ')).trim()
    byFile.set(s.file, lines)
  }
  for (const [file, lines] of byFile) {
    const target = join(mirror, file + '.txt')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, Array.from(lines, (l) => l ?? '').join('\n'))
  }
  const cspell = join(here, 'node_modules', 'cspell', 'bin.mjs')
  try {
    execFileSync(process.execPath, [cspell, 'lint', '--no-progress', '--no-summary', '--no-color', '--relative', '-c', join(here, 'cspell.json'), '**/*.txt'],
      { cwd: mirror, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return []
  } catch (error) {
    if (error.status !== 1) throw error
    return error.stdout.trim().split('\n').filter(Boolean).map((line) => line.replace(/\.txt:/, ':'))
  } finally {
    rmSync(mirror, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const segments = collect()
  const problems = []
  for (const s of segments) for (const p of styleProblems(s.text, { typographicApostrophe: s.file.startsWith('client/') })) problems.push(`${s.file}:${s.line} ${p.rule}: ${p.message}`)
  const spelling = runCspell(segments)
  for (const p of problems) console.log(p)
  for (const p of spelling) console.log(p)
  const files = new Set(segments.map((s) => s.file)).size
  console.log(`\nChecked ${segments.length} pieces of copy in ${files} files: ${problems.length} style and ${spelling.length} spelling problems.`)
  if (problems.length || spelling.length) {
    console.log('Fix the copy. If a word is right (a product, race or running term), add it to tools/copy-check/words.txt.')
    process.exit(1)
  }
}
