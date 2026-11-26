import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const TYPE = '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow'
const METHOD = '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp'
const FLOW = '/identity/authenticationEventsFlows'
const LOCAL = new Set(['EmailPassword-OAUTH', 'EmailOtpSignup-OAUTH'])
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GRAPH = 'https://graph.microsoft.com/v1.0'

function metadata(value) {
  if (Array.isArray(value)) return value.map(metadata)
  if (!value || typeof value !== 'object') return value
  if (value['@odata.nextLink']) throw new Error('A source attribute collection is incomplete; inspect the tenant before preparing a flow.')
  return Object.fromEntries(Object.keys(value).filter(key => !['@odata.context', '@odata.id', '@odata.etag'].includes(key)).sort().map(key => [key, metadata(value[key])]))
}

export function requireId(value) {
  if (!GUID.test(value ?? '')) throw new Error('Supply an explicit tenant/application/flow GUID.')
  return value.toLowerCase()
}

export function applicationIds(flow) {
  const apps = flow.conditions?.applications
  if (apps?.includeAllApplications) throw new Error('An all-applications policy needs administrator review; no change was made.')
  if (!Array.isArray(apps?.includeApplications)) throw new Error('Application bindings are missing; no change was made.')
  return apps.includeApplications.map(item => requireId(item.appId))
}

export function providerIds(flow) {
  const providers = flow.onAuthenticationMethodLoadStart?.identityProviders
  if (!Array.isArray(providers) || providers.some(item => typeof item.id !== 'string' || !item.id)) {
    throw new Error('Identity providers could not be verified; no change was made.')
  }
  return providers.map(item => item.id)
}

/** Provision a new, unassigned flow. Existing applications, users, policies and credentials stay untouched. */
export function passwordFlowBody(source, name) {
  if (source['@odata.type'] !== TYPE) throw new Error('This is not an External ID customer user flow.')
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('Supply a candidate flow name of 1–100 characters.')
  if (source.onInteractiveAuthFlowStart?.isSignUpAllowed !== true) throw new Error('Sign-up is disabled on the source; an administrator must review this.')
  const providers = providerIds(source)
  if (providers.filter(id => LOCAL.has(id)).length !== 1) throw new Error('The source must have exactly one local sign-in method.')
  const attributes = source.onAttributeCollection?.attributes
  if (!Array.isArray(attributes) || !['email', 'displayName'].every(id => attributes.some(a => a.id === id))) {
    throw new Error('The source is missing the expected email/display-name attributes.')
  }
  const body = {
    '@odata.type': TYPE,
    displayName: name.trim(),
    description: 'Password sign-up candidate. Existing OTP users retain their sign-in method. Verify a canary before assigning a live app.',
    conditions: { applications: { includeAllApplications: false, includeApplications: [] } },
    onInteractiveAuthFlowStart: metadata(source.onInteractiveAuthFlowStart),
    onAuthenticationMethodLoadStart: { '@odata.type': METHOD,
      identityProviders: [{ id: 'EmailPassword-OAUTH' }, ...providers.filter(id => !LOCAL.has(id)).map(id => ({ id }))] },
  }
  for (const key of ['onAttributeCollection', 'onAttributeCollectionStart', 'onAttributeCollectionSubmit', 'onUserCreateStart']) {
    if (source[key] != null) body[key] = metadata(source[key])
  }
  return body
}

export function verifyCandidate(source, candidate) {
  if (candidate['@odata.type'] !== TYPE || applicationIds(candidate).length !== 0) {
    throw new Error('The candidate is already assigned or has an unexpected type; it will not be reused.')
  }
  const desired = passwordFlowBody(source, candidate.displayName)
  if (candidate.onInteractiveAuthFlowStart?.isSignUpAllowed !== true
    || JSON.stringify([...providerIds(candidate)].sort()) !== JSON.stringify(desired.onAuthenticationMethodLoadStart.identityProviders.map(p => p.id).sort())) {
    throw new Error('The candidate has unexpected providers/sign-up settings; administrator review is required.')
  }
  for (const key of ['onAttributeCollection', 'onAttributeCollectionStart', 'onAttributeCollectionSubmit', 'onUserCreateStart']) {
    if (canonical(candidate[key] ?? null) !== canonical(source[key] ?? null)) {
      throw new Error('The candidate does not retain the source attributes/extensions; administrator review is required.')
    }
  }
  return candidate
}

function canonical(value) {
  return JSON.stringify(metadata(value))
}

export class Graph {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher }
  async request(path, method = 'GET', body) {
    const url = new URL(path.startsWith('https:') ? path : `${GRAPH}${path}`)
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || !url.pathname.startsWith('/v1.0/')) {
      throw new Error('Refusing to send credentials outside Microsoft Graph v1.0.')
    }
    let response
    try {
      response = await this.fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) })
    } catch {
      throw new Error(method === 'GET' ? 'Microsoft Graph did not respond. Check the administrator session and connection.'
        : 'Microsoft Graph did not confirm creation. Inspect existing candidate flows before retrying; no write was replayed.')
    }
    if (!response.ok) throw new Error(`Microsoft Graph returned HTTP ${response.status}. Check tenant, permissions and administrator role; response details are withheld.`)
    try { return await response.json() } catch { throw new Error('Microsoft Graph returned an unreadable response. Inspect the tenant before retrying a write.') }
  }
  async list(path) {
    const values = []
    const seen = new Set()
    while (path) {
      if (seen.has(path) || seen.size >= 100) throw new Error('Microsoft Graph pagination did not finish safely.')
      seen.add(path)
      const page = await this.request(path)
      if (!Array.isArray(page.value)) throw new Error('Microsoft Graph did not return a collection.')
      values.push(...page.value)
      path = page['@odata.nextLink']
    }
    return values
  }
}

async function readFlow(graph, id) {
  const path = `${FLOW}/${requireId(id)}`
  const flow = await graph.request(path)
  const apps = await graph.list(`${path}/conditions/applications/includeApplications`)
  const providers = await graph.list(`${path}/microsoft.graph.externalUsersSelfServiceSignUpEventsFlow/onAuthenticationMethodLoadStart/microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp/identityProviders`)
  return { ...flow,
    conditions: { ...flow.conditions, applications: { ...flow.conditions?.applications, includeApplications: apps } },
    onAuthenticationMethodLoadStart: { ...flow.onAuthenticationMethodLoadStart, identityProviders: providers } }
}

export async function preparePasswords(graph, { appId, name = 'Taperday password sign-up candidate', create = false }) {
  appId = requireId(appId)
  const apps = await graph.list(`/applications?${new URLSearchParams({ '$filter': `appId eq '${appId}'`, '$select': 'appId,spa' })}`)
  if (apps.length !== 1 || apps[0].appId?.toLowerCase() !== appId
    || !apps[0].spa?.redirectUris?.some(uri => uri === 'https://taperday.run' || uri === 'https://taperday.run/')) {
    throw new Error('The selected application is not the expected production SPA; no change was made.')
  }
  const listed = await graph.list(FLOW)
  const flows = []
  for (const item of listed) {
    if (item['@odata.type'] === TYPE) flows.push(await readFlow(graph, item.id))
  }
  const bound = flows.filter(flow => applicationIds(flow).includes(appId))
  if (bound.length !== 1) throw new Error('The production application must have exactly one verified user-flow binding.')
  const source = bound[0]
  const body = passwordFlowBody(source, name)
  const existing = flows.filter(flow => flow.displayName === body.displayName)
  if (existing.length > 1) throw new Error('Multiple candidate flows have this name. Resolve them in Entra before continuing.')
  let candidate = existing[0] ? verifyCandidate(source, existing[0]) : null
  if (create && !candidate) {
    const made = await graph.request(FLOW, 'POST', body)
    candidate = verifyCandidate(source, await readFlow(graph, requireId(made.id)))
  }
  return { productionAppId: appId, currentFlowId: source.id,
    currentMethod: providerIds(source).find(id => LOCAL.has(id)),
    candidateFlowId: candidate?.id ?? null, candidateCreatedOrReused: !!candidate,
    candidateAssignedToApplications: false, plannedFlow: body,
    existingAccounts: 'No conversion performed. Existing OTP customers keep their original method. Password reset is not proof of an OTP upgrade.',
    next: 'Use a separate canary SPA with this candidate and the production API. Verify signup/password/reset/Google and stable runner identity before the owner assigns the production app. See docs/password-sign-in.md.' }
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { tenant: { type: 'string' }, app: { type: 'string' }, name: { type: 'string' }, create: { type: 'boolean', default: false } } })
  const tenant = requireId(values.tenant)
  const appId = requireId(values.app)
  let credential
  try {
    credential = JSON.parse(execFileSync('az', ['account', 'get-access-token', '--tenant', tenant, '--resource-type', 'ms-graph', '--output', 'json', '--only-show-errors'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch { throw new Error('An Entra administrator must sign Azure CLI into the external tenant first. Do not paste tokens into chat.') }
  if (credential.tenant?.toLowerCase() !== tenant || !credential.accessToken) throw new Error('Azure CLI did not return a credential for the requested external tenant.')
  console.log(JSON.stringify(await preparePasswords(new Graph(credential.accessToken), { appId, name: values.name, create: values.create }), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
