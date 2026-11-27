import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, pairMoves, retiredEmail } from './entra-tidy-moves.mjs'

const upn = id => ({ signInType: 'userPrincipalName', issuer: 'contoso.onmicrosoft.com', issuerAssignedId: `${id}@contoso.onmicrosoft.com` })
const old = (id, email, extra = {}) => ({ id, accountEnabled: false, mail: `retired-${id}@contoso.onmicrosoft.com`,
  proxyAddresses: [`smtp:${id}@contoso.onmicrosoft.com`, `smtp:${email}`, `SMTP:retired-${id}@contoso.onmicrosoft.com`], identities: [upn(id)], ...extra })
const current = (id, email, extra = {}) => ({ id, accountEnabled: true, identities: [
  { signInType: 'federated', issuer: 'mail', issuerAssignedId: email },
  { signInType: 'emailAddress', issuer: 'contoso.onmicrosoft.com', issuerAssignedId: email }, upn(id)], ...extra })

test('only a disabled, retired account with no sign-in identity counts as an old moved account', () => {
  assert.equal(retiredEmail(old('a', 'Runner@Example.com')), 'runner@example.com')
  assert.equal(retiredEmail(old('a', 'runner@example.com', { accountEnabled: true })), null)
  assert.equal(retiredEmail(old('a', 'runner@example.com', { mail: 'runner@example.com' })), null)
  assert.equal(retiredEmail(old('a', 'runner@example.com', { identities: [upn('a'), { signInType: 'federated', issuer: 'mail', issuerAssignedId: 'runner@example.com' }] })), null)
  assert.equal(retiredEmail(old('a', 'runner@example.com', { proxyAddresses: ['SMTP:retired-a@contoso.onmicrosoft.com'] })), null)
  assert.equal(retiredEmail({ id: 'm', accountEnabled: true, identities: [upn('m')] }), null)
})

test('each old account pairs with the one enabled account that signs in with its email', () => {
  const pairs = pairMoves([old('a', 'one@example.com'), current('b', 'one@example.com'), old('c', 'two@example.com'), current('d', 'other@example.com')])
  assert.deepEqual(pairs.map(p => [p.old.id, p.current?.id ?? null]), [['a', 'b'], ['c', null]])
})

test('an email used by two enabled accounts is never guessed between', () => {
  const pairs = pairMoves([old('a', 'one@example.com'), current('b', 'one@example.com'), current('c', 'one@example.com')])
  assert.equal(pairs[0].current, null)
  assert.equal(decide(pairs[0], new Set(['b', 'c'])), 'unclear')
})

test('an old account is removed only after the new one has signed in', () => {
  const [pair] = pairMoves([old('a', 'one@example.com'), current('b', 'one@example.com')])
  assert.equal(decide(pair, new Set()), 'waiting')
  assert.equal(decide(pair, new Set(['a'])), 'waiting')
  assert.equal(decide(pair, new Set(['b'])), 'remove')
})

test('a disabled new account is not a pair', () => {
  const pairs = pairMoves([old('a', 'one@example.com'), current('b', 'one@example.com', { accountEnabled: false })])
  assert.equal(pairs[0].current, null)
})
