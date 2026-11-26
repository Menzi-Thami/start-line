import { pathToFileURL } from 'node:url'

/** Human/provider acceptance is separate from CI. No staging-smoke override bypasses this guard. */
export function validateReleaseAcceptance({ candidate, tested, confirmed, evidence }) {
  if (!/^[a-f0-9]{40}$/.test(candidate ?? '') || tested !== candidate) {
    throw new Error('Release blocked: enter the full staging SHA that passed R01–R18. It must match the current staging candidate.')
  }
  if (confirmed !== 'true') throw new Error('Release blocked: owner confirmation of the real-provider and physical-device acceptance checks is required.')
  let url
  try { url = new URL(evidence) } catch { throw new Error('Release blocked: provide an HTTPS link to the completed acceptance evidence.') }
  if (url.protocol !== 'https:' || url.username || url.password || !url.pathname || url.pathname === '/' || url.search || url.hash) {
    throw new Error('Release blocked: evidence must be a direct HTTPS page/report link without credentials, query parameters or fragments.')
  }
  return { candidate, evidence: url.href }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateReleaseAcceptance({ candidate: process.env.CANDIDATE_SHA, tested: process.env.TESTED_SHA,
      confirmed: process.env.ACCEPTANCE_CONFIRMED, evidence: process.env.ACCEPTANCE_EVIDENCE })
    console.log('Owner acceptance recorded for the exact staging candidate. Deployment and full CI gates still apply.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
