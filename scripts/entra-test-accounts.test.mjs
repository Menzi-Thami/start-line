import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newAccountBody, randomPassword, signInEmail, testAccounts, testInbox, testTag } from './entra-test-accounts.mjs'

const user = (id, ...identities) => ({ id, identities: [...identities, { signInType: 'userPrincipalName', issuer: 'contoso.onmicrosoft.com', issuerAssignedId: `${id}@contoso.onmicrosoft.com` }] })
const password = email => ({ signInType: 'emailAddress', issuer: 'contoso.onmicrosoft.com', issuerAssignedId: email })
const code = email => ({ signInType: 'federated', issuer: 'mail', issuerAssignedId: email })

test('only tagged test addresses count as test accounts', () => {
  assert.equal(testTag('runner+qa1@example.com'), 'qa1')
  assert.equal(testTag('runner+OTPTEST3@example.com'), 'otptest3')
  assert.equal(testTag('runner@example.com'), null)
  assert.equal(testTag('runner+news@example.com'), null)
  assert.equal(testTag('runner+qa1+x@example.com'), null)
  assert.equal(testTag(undefined), null)
})

test('a real runner is never picked up, even with both sign-in methods', () => {
  const rows = testAccounts([
    user('a', password('runner@example.com'), code('runner@example.com')),
    user('b', password('tester+pwtest1@example.com')),
    user('c', password('tester+otptest3@example.com'), code('tester+otptest3@example.com')),
    user('d', code('someone+holiday@example.com')),
  ])
  assert.deepEqual(rows.map(r => [r.user.id, r.tag]), [['b', 'pwtest1'], ['c', 'otptest3']])
})

test('an account whose identities name two different emails is not treated as a test account', () => {
  assert.equal(signInEmail(user('x', password('tester+qa1@example.com'), code('runner@example.com'))), null)
})

test('the test inbox must be unambiguous', () => {
  const rows = testAccounts([user('b', password('tester+pwtest1@example.com')), user('c', password('tester+qa2@example.com'))])
  assert.equal(testInbox(rows), 'tester@example.com')
  assert.throws(() => testInbox([...rows, ...testAccounts([user('d', password('other+qa3@example.com'))])]), /one test inbox/)
  assert.throws(() => testInbox([]), /one test inbox/)
})

test('a new test account is a password account on the tagged inbox address', () => {
  const body = newAccountBody('tester@example.com', 'qa7', 'Secret-1', 'contoso.onmicrosoft.com')
  assert.deepEqual(body.identities, [password('tester+qa7@example.com')])
  assert.equal(body.passwordProfile.forceChangePasswordNextSignIn, false)
  assert.equal(body.passwordPolicies, 'DisablePasswordExpiration')
  assert.match(body.userPrincipalName, /@contoso\.onmicrosoft\.com$/)
  assert.equal(body.displayName, 'QA qa7')
  assert.equal('mail' in body, false)
  assert.throws(() => newAccountBody('tester@example.com', 'admin', 'x', 'contoso.onmicrosoft.com'), /tag/)
  assert.throws(() => newAccountBody('tester+x@example.com', 'qa1', 'x', 'contoso.onmicrosoft.com'), /plain address/)
})

test('generated passwords are long and mixed', () => {
  const a = randomPassword(), b = randomPassword()
  assert.notEqual(a, b)
  assert.ok(a.length >= 24 && /[a-z]/.test(a) && /[A-Z]/.test(a) && /\d/.test(a) && /[^A-Za-z0-9]/.test(a))
})
