// Test accounts for checking sign-in and runner journeys on production (docs/qa/test-accounts.md).
//
//   node scripts/entra-test-accounts.mjs list     --tenant <tenant-id>
//   node scripts/entra-test-accounts.mjs create   --tenant <tenant-id> --tag qa1
//   node scripts/entra-test-accounts.mjs password --tenant <tenant-id> --tag qa1
//   node scripts/entra-test-accounts.mjs remove   --tenant <tenant-id> --tag qa1
//
// Signed in as the CLI admin account (docs/accounts-setup.md, section 8). It only ever touches an account whose sign-in
// email carries a test tag (+qa…, +otptest…, +pwtest…) on the shared test inbox, and refuses anything else. A password
// it sets is random and is written only to a file in your home folder, never printed or committed. Removing an account
// is Microsoft's soft delete, restorable for 30 days.
import { execSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TAG = /^(qa|otptest|pwtest)[a-z0-9-]{0,20}$/
export const SECRETS = join(homedir(), '.taperday', 'test-accounts.json')

/** The test tag of a sign-in email ("qa1" for name+qa1@example.com), or null when it isn't a test address. */
export function testTag(email) {
  const match = /^[^+@\s]+\+([^@\s]+)@[^@\s]+$/.exec(email ?? '')
  return match && TAG.test(match[1].toLowerCase()) ? match[1].toLowerCase() : null
}

/** The one sign-in email of an account (password or email code), or null. */
export function signInEmail(user) {
  const emails = new Set((user.identities ?? [])
    .filter(i => i.signInType === 'emailAddress' || (i.signInType === 'federated' && i.issuer === 'mail'))
    .map(i => i.issuerAssignedId?.toLowerCase()).filter(Boolean))
  return emails.size === 1 ? [...emails][0] : null
}

/** Test accounts with their tags. A tag used twice is reported, never guessed between. */
export function testAccounts(users) {
  return users.map(user => ({ user, email: signInEmail(user) }))
    .map(row => ({ ...row, tag: testTag(row.email) }))
    .filter(row => row.tag)
}

/** The shared test inbox (name@domain without a tag), taken from the existing test accounts. */
export function testInbox(accounts) {
  const inboxes = new Set(accounts.map(a => a.email.replace(/\+[^@]+@/, '@')))
  if (inboxes.size !== 1) throw new Error(`Expected one test inbox across the test accounts, found ${inboxes.size}. Pass --inbox.`)
  return [...inboxes][0]
}

export function newAccountBody(inbox, tag, password, tenantDomain) {
  if (!TAG.test(tag)) throw new Error('A tag starts with qa, otptest or pwtest, then up to 20 lowercase letters, digits or dashes.')
  const [name, domain] = inbox.split('@')
  if (!name || !domain || name.includes('+')) throw new Error('The inbox must be a plain address without a +tag.')
  const email = `${name}+${tag}@${domain}`
  const nickname = randomUUID()
  return {
    accountEnabled: true,
    displayName: `QA ${tag}`,
    mailNickname: nickname,
    userPrincipalName: `${nickname}@${tenantDomain}`,
    identities: [{ signInType: 'emailAddress', issuer: tenantDomain, issuerAssignedId: email }],
    passwordProfile: { password, forceChangePasswordNextSignIn: false },
    passwordPolicies: 'DisablePasswordExpiration',
  }
}

export function randomPassword() {
  return `${randomBytes(18).toString('base64url')}aA1!`
}

class Graph {
  constructor(token) { this.token = token }
  async request(path, method = 'GET', body) {
    const response = await fetch(`${GRAPH}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(`Microsoft Graph returned HTTP ${response.status}: ${json.error?.message ?? 'no details'}`)
    return json
  }
  async list(path) {
    const values = []
    for (let page = 0; path && page < 50; page++) {
      const result = await this.request(path)
      values.push(...result.value)
      path = result['@odata.nextLink']?.replace(GRAPH, '')
    }
    return values
  }
}

function token(tenant) {
  // One fixed command line; its only variable part is the tenant, already checked to be a GUID. A command string (not
  // an argument list) is what lets Windows find az.cmd.
  const ask = scope => execSync(`az account get-access-token ${scope} ${tenant} --resource-type ms-graph --query accessToken --output tsv --only-show-errors`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  // When another tenant is the default, Azure CLI finds the tenant-level login under --subscription, not --tenant.
  try { return ask('--tenant') } catch { return ask('--subscription') }
}

function savePassword(tag, password) {
  mkdirSync(join(homedir(), '.taperday'), { recursive: true })
  const saved = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, 'utf8')) : {}
  saved[tag] = { password, setAt: new Date().toISOString() }
  writeFileSync(SECRETS, JSON.stringify(saved, null, 2), { mode: 0o600 })
  try { chmodSync(SECRETS, 0o600) } catch { /* Windows keeps the user-profile ACL */ }
}

async function main() {
  const { positionals: [command], values } = parseArgs({ allowPositionals: true, options: { tenant: { type: 'string' }, tag: { type: 'string' }, inbox: { type: 'string' } } })
  if (!GUID.test(values.tenant ?? '')) throw new Error('Pass --tenant <External ID tenant id>.')
  const graph = new Graph(token(values.tenant))
  const users = await graph.list('/users?$select=id,displayName,identities,accountEnabled,createdDateTime&$top=999')
  const accounts = testAccounts(users)
  const tag = values.tag?.toLowerCase()
  const matching = accounts.filter(a => a.tag === tag)

  if (command === 'list') {
    for (const a of accounts.sort((x, y) => x.tag.localeCompare(y.tag))) {
      const kinds = a.user.identities.filter(i => i.signInType !== 'userPrincipalName').map(i => i.signInType === 'emailAddress' ? 'password' : 'email code').join(' + ')
      console.log(`+${a.tag.padEnd(12)} ${a.user.accountEnabled ? 'enabled ' : 'disabled'}  ${kinds.padEnd(22)} created ${a.user.createdDateTime.slice(0, 10)}  object ${a.user.id}`)
    }
    console.log(`${accounts.length} test accounts. Saved passwords: ${SECRETS}`)
    return
  }
  if (!tag) throw new Error('Pass --tag.')
  if (command === 'create') {
    if (matching.length) throw new Error(`+${tag} already exists.`)
    const domain = users.flatMap(u => u.identities).find(i => i.signInType === 'userPrincipalName')?.issuer
    const password = randomPassword()
    const created = await graph.request('/users', 'POST', newAccountBody(values.inbox ?? testInbox(accounts), tag, password, domain))
    savePassword(tag, password)
    console.log(`Created +${tag} (object ${created.id}); its password is in ${SECRETS}.`)
    return
  }
  if (matching.length !== 1) throw new Error(`Expected one enabled-or-disabled account tagged +${tag}, found ${matching.length}.`)
  const [{ user }] = matching
  if (command === 'password') {
    if (!user.identities.some(i => i.signInType === 'emailAddress')) throw new Error(`+${tag} has no password sign-in.`)
    const password = randomPassword()
    await graph.request(`/users/${user.id}`, 'PATCH', { passwordProfile: { password, forceChangePasswordNextSignIn: false } })
    savePassword(tag, password)
    console.log(`New password for +${tag} is in ${SECRETS}.`)
    return
  }
  if (command === 'remove') {
    await graph.request(`/users/${user.id}`, 'DELETE')
    console.log(`Removed +${tag} (object ${user.id}); restorable for 30 days under Deleted users. Its runner row, if any, stays.`)
    return
  }
  throw new Error('Command: list, create, password or remove.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
