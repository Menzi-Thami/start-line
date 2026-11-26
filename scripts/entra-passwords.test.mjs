import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Graph, applicationIds, passwordFlowBody, preparePasswords, requireId, verifyCandidate } from './entra-passwords.mjs'

const appId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const candidateId = '33333333-3333-4333-8333-333333333333'
const source = () => ({ id: sourceId, '@odata.type': '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow', displayName: 'Original OTP',
  conditions: { applications: { includeAllApplications: false, includeApplications: [{ appId }] } },
  onInteractiveAuthFlowStart: { '@odata.type': '#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp', isSignUpAllowed: true },
  onAuthenticationMethodLoadStart: { identityProviders: [{ id: 'EmailOtpSignup-OAUTH' }, { id: 'Google-OAUTH' }, { id: 'Custom-OIDC' }] },
  onAttributeCollection: { '@odata.type': '#microsoft.graph.onAttributeCollectionExternalUsersSelfServiceSignUp', attributes: [{ id: 'email' }, { id: 'displayName' }, { id: 'extension_custom' }], attributeCollectionPage: { views: [{ inputs: [{ attribute: 'extension_custom', required: true }] }] } },
  onUserCreateStart: { '@odata.type': '#microsoft.graph.onUserCreateStartExternalUsersSelfServiceSignUp', userTypeToCreate: 'member' } })

function fakeGraph({ app = { appId, spa: { redirectUris: ['https://taperday.run/'] } }, rows = [source()] } = {}) {
  const writes = []
  const graph = {
    async list(path) {
      if (path.startsWith('/applications?')) return [app]
      if (path === '/identity/authenticationEventsFlows') return rows
      const id = path.split('/')[3], flow = rows.find(f => f.id === id)
      if (path.endsWith('/includeApplications')) return flow.conditions.applications.includeApplications
      if (path.endsWith('/identityProviders')) return flow.onAuthenticationMethodLoadStart.identityProviders
      throw new Error('Unexpected path')
    },
    async request(path, method = 'GET', body) {
      if (method === 'POST') {
        assert.equal(path, '/identity/authenticationEventsFlows')
        writes.push({ path, body })
        const flow = { id: candidateId, ...structuredClone(body) }
        rows.push(flow)
        return flow
      }
      return structuredClone(rows.find(f => f.id === path.split('/').at(-1)))
    },
  }
  return { graph, rows, writes }
}

test('candidate preserves attributes, extensions and every social provider, and has no assigned app', () => {
  const old = source(), copy = structuredClone(old)
  const body = passwordFlowBody(old, 'Password candidate')
  assert.deepEqual(body.onAuthenticationMethodLoadStart.identityProviders.map(p => p.id), ['EmailPassword-OAUTH', 'Google-OAUTH', 'Custom-OIDC'])
  assert.deepEqual(body.onAttributeCollection, old.onAttributeCollection)
  assert.deepEqual(body.onUserCreateStart, old.onUserCreateStart)
  assert.deepEqual(applicationIds(body), [])
  assert.deepEqual(old, copy)
})

test('inspect is read-only and does not claim an existing-user conversion', async () => {
  const { graph, writes } = fakeGraph()
  const report = await preparePasswords(graph, { appId })
  assert.equal(writes.length, 0)
  assert.equal(report.currentFlowId, sourceId)
  assert.match(report.existingAccounts, /No conversion performed/)
})

test('create is idempotent and never modifies the existing production binding', async () => {
  const { graph, rows, writes } = fakeGraph()
  const first = await preparePasswords(graph, { appId, create: true })
  const second = await preparePasswords(graph, { appId, create: true })
  assert.equal(first.candidateFlowId, candidateId)
  assert.equal(second.candidateFlowId, candidateId)
  assert.equal(writes.length, 1)
  assert.deepEqual(applicationIds(rows[0]), [appId])
  assert.deepEqual(applicationIds(rows[1]), [])
})

test('wrong production SPA and wrong application ID fail before writing', async () => {
  const f = fakeGraph({ app: { appId, spa: { redirectUris: ['https://staging.example.test/'] } } })
  await assert.rejects(preparePasswords(f.graph, { appId, create: true }), /production SPA/)
  assert.equal(f.writes.length, 0)
  assert.throws(() => requireId('not-a-guid'), /GUID/)
})

test('ambiguous application bindings and all-app policies fail closed', async () => {
  const a = source(), b = { ...source(), id: candidateId }
  const f = fakeGraph({ rows: [a, b] })
  await assert.rejects(preparePasswords(f.graph, { appId, create: true }), /exactly one/)
  assert.equal(f.writes.length, 0)
  assert.throws(() => applicationIds({ conditions: { applications: { includeAllApplications: true } } }), /all-applications/)
})

test('disabled signup, unknown local methods and missing attributes are never guessed', () => {
  const a = source(); a.onInteractiveAuthFlowStart.isSignUpAllowed = false
  assert.throws(() => passwordFlowBody(a, 'Candidate'), /disabled/)
  const b = source(); b.onAuthenticationMethodLoadStart.identityProviders = [{ id: 'Google-OAUTH' }]
  assert.throws(() => passwordFlowBody(b, 'Candidate'), /exactly one/)
  const c = source(); c.onAttributeCollection.attributes = [{ id: 'email' }]
  assert.throws(() => passwordFlowBody(c, 'Candidate'), /attributes/)
})

test('existing candidates with changed policies or assignments are not overwritten', () => {
  const original = source(), candidate = { id: candidateId, ...passwordFlowBody(original, 'Candidate') }
  candidate.onUserCreateStart.userTypeToCreate = 'guest'
  assert.throws(() => verifyCandidate(original, candidate), /attributes\/extensions/)
  candidate.onUserCreateStart = structuredClone(original.onUserCreateStart)
  candidate.conditions.applications.includeApplications = [{ appId }]
  assert.throws(() => verifyCandidate(original, candidate), /already assigned/)
})

test('Graph property order and transport annotations do not invalidate matching attributes', () => {
  const original = source(), candidate = { id: candidateId, ...passwordFlowBody(original, 'Candidate') }
  candidate.onUserCreateStart = { userTypeToCreate: 'member', '@odata.context': 'transport-only', '@odata.type': original.onUserCreateStart['@odata.type'] }
  assert.equal(verifyCandidate(original, candidate), candidate)
})

test('creation excludes source transport annotations and refuses partial custom attributes', () => {
  const original = source()
  original.onAttributeCollection['@odata.context'] = 'source-policy-url'
  assert.equal(passwordFlowBody(original, 'Candidate').onAttributeCollection['@odata.context'], undefined)
  original.onAttributeCollection['@odata.nextLink'] = 'https://graph.microsoft.com/v1.0/more'
  assert.throws(() => passwordFlowBody(original, 'Candidate'), /incomplete/)
})

test('Graph pagination cannot forward a token to a different host', async () => {
  const calls = []
  const graph = new Graph('private-token', async url => { calls.push(String(url)); return new Response(JSON.stringify({ value: [], '@odata.nextLink': 'https://example.test/steal' })) })
  await assert.rejects(graph.list('/identity/authenticationEventsFlows'), /outside Microsoft Graph/)
  assert.equal(calls.length, 1)
})

test('failed/uncertain writes are not replayed and diagnostic messages cannot expose credentials', async () => {
  let calls = 0
  const graph = new Graph('private-token', async () => { calls++; throw new Error('private-token secret-provider-response') })
  await assert.rejects(graph.request('/identity/authenticationEventsFlows', 'POST', {}), error => {
    assert.match(error.message, /no write was replayed/)
    assert.doesNotMatch(error.message, /private-token|secret-provider/)
    return true
  })
  assert.equal(calls, 1)
  const denied = new Graph('private-token', async () => new Response('secret-user-details', { status: 403 }))
  await assert.rejects(denied.request('/applications'), /HTTP 403.*details are withheld/)
})
