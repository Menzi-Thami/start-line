import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const clientRequire = createRequire(new URL('../client/package.json', import.meta.url))
const matcherPath = clientRequire.resolve('picomatch')
const picomatch = clientRequire('picomatch')

// A regexp blocks its own event loop; a Promise/Vitest timeout cannot stop it.
// Exercise the installed dependency in a child with an external kill deadline.
function checkInChild(script) {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const pm = require(${JSON.stringify(matcherPath)});
    ${script}
  `], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr + result.stdout)
}

test('every build/test glob consumer resolves the private security backport', () => {
  const expected = realpathSync(fileURLToPath(new URL('../client/vendor/picomatch/index.js', import.meta.url)))
  assert.equal(realpathSync(matcherPath), expected)
  for (const consumer of ['vite', 'vitest', 'tinyglobby', 'fdir']) {
    const consumerRequire = createRequire(clientRequire.resolve(consumer))
    assert.equal(realpathSync(consumerRequire.resolve('picomatch')), expected, consumer)
  }
  assert.equal(clientRequire('picomatch/package.json').name, '@taperday/picomatch')
})

test('ordinary file discovery, ignored paths and fixed extglobs retain matching semantics', () => {
  const isTest = picomatch('**/*.{test,spec}.{ts,tsx}', { dot: true })
  assert.equal(isTest('src/features/runner-home/Home.test.tsx'), true)
  assert.equal(isTest('e2e/simplicity.spec.ts'), true)
  assert.equal(isTest('src/features/runner-home/Home.tsx'), false)
  assert.equal(picomatch('**/node_modules/**')('a/node_modules/b/index.js'), true)
  assert.equal(picomatch('**/*.ts', { dot: false })('.cache/source.ts'), false)
  assert.equal(picomatch('**/*.ts', { dot: true })('.cache/source.ts'), true)
  assert.equal(picomatch('+(foo|bar).ts')('foobar.ts'), true)
})

test('wildcards, alternatives, literal stars and POSIX entry remain compatible', () => {
  for (const options of [{}, { dot: true }, { windows: true }, { bash: true }, { nocase: true }]) {
    assert.equal(picomatch('+(*a)', options)('aaa'), true)
    assert.equal(picomatch('+(a*b)', options)('abab'), true)
    assert.equal(picomatch('*(a*|b)', options)('bbb'), true)
    assert.equal(picomatch('*(a*|b)', options)('ax'), true)
    assert.equal(picomatch('*(a*|b)', options)('cx'), false)
    assert.equal(picomatch('*/*(W*, *)*', options)('my/folder (Work, Accts)'), true)
    for (const pattern of ['+([*])', '+("*")', '+(\\*)']) {
      assert.equal(picomatch(pattern, options)('***'), true)
    }
  }
  assert.equal(clientRequire('picomatch/posix')('+(*a)')('aaa'), true)
})

test('advisory examples and nested/alternative wildcard near-misses finish before the kill deadline', () => {
  checkInChild(`
    const input = 'a'.repeat(60000) + '/';
    const patterns = ['+(*a)', '*(*a)', '+(*)b', '+(a*)b', '+(@(*a))', '+(@(*)a)',
      '+(*a|b)', '+(*a|b)b', '*(*a|b)b', '+(a*a*a*a*a*)', '*(a*|b)z', '+(a*|b)z'];
    for (const options of [{}, { dot: true }, { windows: true }, { bash: true }, { capture: true }]) {
      for (const pattern of patterns) assert.equal(pm(pattern, options)(input), false, pattern);
    }
    assert.equal(pm('+(*)b')('a'.repeat(10000)), false);
  `)
})

test('bracket parsing, case folding and multiple-star regressions finish before the kill deadline', () => {
  checkInChild(`
    const input = 'a'.repeat(60000) + '/';
    for (const options of [{ nocase: true }, { flags: 'i' }]) {
      assert.equal(pm('+(A*|a)', options)(input), false);
      assert.equal(pm('*(A*|a)', options)(input), false);
    }
    for (const options of [{}, { nobracket: true }]) {
      assert.equal(pm('+([*a)', options)('[a'.repeat(10000) + '!'), false);
      assert.equal(pm('+([*a])', options)('[a]'.repeat(10000) + '!'), false);
    }
    assert.equal(pm('+(W*, *)z')('W, '.repeat(10000) + '!'), false);
    assert.equal(pm('*(W*, *)z')('W, '.repeat(10000) + '!'), false);
  `)
})
