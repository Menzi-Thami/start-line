import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateReleaseAcceptance } from './release-acceptance.mjs'

const valid = { candidate: 'a'.repeat(40), tested: 'a'.repeat(40), confirmed: 'true', evidence: 'https://chatgpt.com/space/page_test' }

test('records explicit acceptance for the exact candidate and a direct evidence page', () => {
  assert.equal(validateReleaseAcceptance(valid).candidate, valid.candidate)
})
test('a stale or abbreviated tested SHA cannot promote a newer candidate', () => {
  for (const tested of ['a'.repeat(7), 'b'.repeat(40), '', undefined]) assert.throws(() => validateReleaseAcceptance({ ...valid, tested }), /match/)
})
test('unknown candidate state fails closed', () => {
  assert.throws(() => validateReleaseAcceptance({ ...valid, candidate: '', tested: '' }), /Release blocked/)
})
test('evidence and passing CI do not substitute for owner device/provider confirmation', () => {
  for (const confirmed of ['false', '', undefined, true]) assert.throws(() => validateReleaseAcceptance({ ...valid, confirmed }), /confirmation/)
})
test('evidence links cannot carry credentials or callback parameters', () => {
  for (const evidence of ['', 'not-a-url', 'http://example.test/report', 'https://example.test/',
    'https://user:secret@example.test/report', 'https://example.test/report?code=sensitive', 'https://example.test/report#token']) {
    assert.throws(() => validateReleaseAcceptance({ ...valid, evidence }), /Release blocked/)
  }
})
