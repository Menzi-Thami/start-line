// Tidies up after the move to password sign-in (docs/password-sign-in.md), one runner at a time, as each one signs in.
//
//   node scripts/entra-tidy-moves.mjs --tenant <tenant-id>           # report only, changes nothing
//   node scripts/entra-tidy-moves.mjs --tenant <tenant-id> --apply   # remove old accounts whose runner has moved on
//
// Each moved runner left an old, disabled account behind (mail "retired-…", no sign-in identity, the runner's email kept
// only as a hidden proxy address). That old account is the way back until the runner has signed in to their new
// account. Once they have, the old account is removed with Microsoft's soft delete (restorable for 30 days under
// Deleted users). Safe to run as often as you like: an account that isn't clearly paired and signed in is left alone.
// Run as the CLI admin account (docs/accounts-setup.md, section 8). Output shows object IDs, never emails.
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { Graph, graphToken } from './entra-test-accounts.mjs'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The runner's email on an old moved account, or null when the account doesn't look exactly like one. */
export function retiredEmail(user) {
  if (user.accountEnabled !== false || !/^retired-[^@]+@[^@]+\.onmicrosoft\.com$/i.test(user.mail ?? '')) return null
  if ((user.identities ?? []).some(i => i.signInType !== 'userPrincipalName')) return null
  const emails = (user.proxyAddresses ?? []).map(p => p.replace(/^smtp:/i, '').toLowerCase()).filter(a => !a.endsWith('.onmicrosoft.com'))
  return emails.length === 1 ? emails[0] : null
}

/** Pairs each old moved account with the one enabled account that now signs in with the same email. */
export function pairMoves(users) {
  const byEmail = new Map()
  for (const user of users.filter(u => u.accountEnabled === true)) {
    for (const i of user.identities ?? []) {
      if (i.signInType !== 'emailAddress') continue
      const email = i.issuerAssignedId.toLowerCase()
      byEmail.set(email, byEmail.has(email) ? null : user)   // null marks an email used by two accounts: never guess
    }
  }
  return users.map(old => ({ old, email: retiredEmail(old) })).filter(row => row.email)
    .map(({ old, email }) => ({ old, current: byEmail.get(email) ?? null }))
}

/** Whether a move can be tidied: a clear pair whose new account has a successful sign-in. */
export function decide(pair, signedIn) {
  if (!pair.current) return 'unclear'
  return signedIn.has(pair.current.id) ? 'remove' : 'waiting'
}

async function signedInAccounts(graph, users) {
  const signedIn = new Set(users.filter(u => u.signInActivity?.lastSuccessfulSignInDateTime).map(u => u.id))
  // "signInActivity" can lag by hours; the sign-in log is immediate but only kept for 7 days. Use both.
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  for (const row of await graph.list(`/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since} and status/errorCode eq 0`)}&$select=userId&$top=500`)) {
    signedIn.add(row.userId)
  }
  return signedIn
}

async function main() {
  const { values } = parseArgs({ options: { tenant: { type: 'string' }, apply: { type: 'boolean', default: false } } })
  if (!GUID.test(values.tenant ?? '')) throw new Error('Pass --tenant <External ID tenant id>.')
  const graph = new Graph(graphToken(values.tenant))
  const users = await graph.list('/users?$select=id,accountEnabled,mail,proxyAddresses,identities,signInActivity&$top=999')
  const pairs = pairMoves(users)
  const signedIn = await signedInAccounts(graph, users)
  const counts = { remove: 0, waiting: 0, unclear: 0 }
  for (const pair of pairs) {
    const decision = decide(pair, signedIn)
    counts[decision]++
    if (decision === 'remove') {
      if (values.apply) await graph.request(`/users/${pair.old.id}`, 'DELETE')
      console.log(`old ${pair.old.id}: new account ${pair.current.id} has signed in, ${values.apply ? 'old account removed' : 'would remove the old account'}`)
    } else if (decision === 'waiting') {
      console.log(`old ${pair.old.id}: waiting for new account ${pair.current.id} to sign in`)
    } else {
      console.log(`old ${pair.old.id}: no single enabled account signs in with its email; left alone, check by hand`)
    }
  }
  console.log(`${values.apply ? 'Removed' : 'Would remove'} ${counts.remove}, waiting ${counts.waiting}, unclear ${counts.unclear}.`)
  if (pairs.length === counts.remove && counts.remove > 0 && values.apply) {
    console.log('Every moved runner has signed in. Last steps: clear the production secret RUNNER_IDENTITY_MOVES and delete the "Taperday sign up and sign in v2" user flow in the portal.')
  } else if (pairs.length === 0) {
    console.log('No old moved accounts left. If not done yet: clear RUNNER_IDENTITY_MOVES and delete the v2 user flow.')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
