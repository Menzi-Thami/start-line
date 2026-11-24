// The copy check must catch what it claims to, and leave code alone. Run: npm test (in tools/copy-check).
import assert from 'node:assert/strict'
import test from 'node:test'
import { runCspell, styleProblems } from './copy-check.mjs'
import { extractCSharp, extractTypeScript } from './extract.mjs'

const rules = (text, options) => styleProblems(text, options).map((p) => p.rule)
const texts = (source, name = 'Screen.tsx') => extractTypeScript(name, source).map((s) => s.text.trim())

test('American spellings in copy are flagged with the British form', () => {
  for (const us of ['Pick a color you like', 'Your favorite race', 'Ten kilometers to go', 'Run canceled by you',
    'We analyze your runs', 'Personalize your plan', 'Head toward the finish', 'A new training program']) {
    assert.deepEqual(rules(us), ['british'], us)
  }
  assert.deepEqual(rules('Pick a colour you like, ten kilometres, cancelled, towards the finish, your programme'), [])
})

test("another product's own menu label is not corrected, but our words around it are", () => {
  assert.deepEqual(rules('Open Data Sharing and Authorization, then tap Strava'), [])
  assert.deepEqual(rules('Open Data Sharing and Authorization and authorize Strava'), ['british'])
})

test('slips that read badly are flagged', () => {
  assert.deepEqual(rules('Save the the run'), ['doubled-word'])
  assert.deepEqual(rules('You ran undefined km'), ['placeholder'])
  assert.deepEqual(rules('Pace NaN per km'), ['placeholder'])
  assert.deepEqual(rules('Shown as [object Object] here'), ['doubled-word', 'placeholder'])
  assert.deepEqual(rules('TODO write this bit'), ['placeholder'])
  assert.deepEqual(rules('Two  spaces here'), ['spacing'])
  assert.deepEqual(rules('A space before , a comma'), ['spacing'])
  assert.deepEqual(rules('Saved!! Well done'), ['punctuation'])
  assert.deepEqual(rules('You ran 1 runs this week'), ['plural'])
  assert.deepEqual(rules('Days marked ? are optional'), [])
  assert.deepEqual(rules('Loading…'), [])
})

test('straight apostrophes are flagged on screens, not in API text', () => {
  assert.deepEqual(rules("Today's run"), ['apostrophe'])
  assert.deepEqual(rules('Today’s run'), [])
  assert.deepEqual(rules("Today's run", { typographicApostrophe: false }), [])
})

test('a dynamic value reads as a word, so a hole never causes a false doubled word', () => {
  const [segment] = extractTypeScript('x.tsx', 'const m = `You ran ${km} km of ${planned} km`')
  assert.equal(segment.text.includes('⁣N⁣'), true)
  assert.deepEqual(rules(segment.text), [])
})

test('JSX text, copy attributes and sentences are extracted; code is not', () => {
  const source = `
    import { thing } from './some path/that has words'
    type Kind = 'two words' | 'other words'
    export function Screen({ open }: { open: boolean }) {
      if (mode === 'needs sign in') return null
      const store = localStorage.getItem('taperday last plan')
      return <section className={open ? 'card card-open color center' : 'card'} data-x="not copy here">
        <h1 aria-label="Your favourite runs">Your runs</h1>
        <p>Pick a color you like.</p>
        <input placeholder="Search for a race" />
        {open && 'Saved to your plan'}
        <svg><text>{'<rect fill="red"/>'}</text></svg>
      </section>
    }`
  const found = texts(source)
  assert.deepEqual(found.sort(), ['Pick a color you like.', 'Saved to your plan', 'Search for a race', 'Your favourite runs', 'Your runs'].sort())
})

test('class names in objects and conditionals are code', () => {
  assert.deepEqual(texts("const props = { className: `runner runner-${pose}` }; const b = <a className={cx(open ? 'button button-primary' : 'button')} />", 'x.tsx'), [])
})

test('C# strings: words extracted, markup, holes, comments and iCalendar lines dropped', () => {
  const source = `
    // A comment about color
    var subject = "Your week ahead";
    var html = $"""<p style="color:{Ink};">You ran {km} km. Nice color choice.</p>""";
    var ics = "PRODID:-//Taperday//Training plan//EN";
    var ch = '"';
    var after = "Still extracted after a char literal";`
  const found = extractCSharp(source).map((s) => s.text.trim())
  assert.deepEqual(found, ['Your week ahead', 'You ran ⁣N⁣ km. Nice color choice.', 'Still extracted after a char literal'])
  assert.equal(extractCSharp(source)[0].line, 3)
})

test('cspell (pinned) flags a misspelling and accepts reviewed words and British spelling', () => {
  const problems = runCspell([
    { file: 'client/src/Fixture.tsx', line: 1, text: 'Taperday will recieve your Strava runs' },
    { file: 'client/src/Fixture.tsx', line: 2, text: 'Your favourite colour, in kilometres, for the fartlek' },
  ])
  assert.equal(problems.length, 1, problems.join('\n'))
  assert.match(problems[0], /Fixture\.tsx:1:.*recieve/)
})
