import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Monthly quota exhaustion cannot recover during the cold-start/firewall retry window. */
export const monthlySqlQuotaExhausted = text => /Error Number:\s*42119\b|monthly free amount allowance[\s\S]*paused/i.test(text)

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (monthlySqlQuotaExhausted(readFileSync(process.argv[2], 'utf8'))) {
    console.error('Database migration stopped: Azure SQL monthly free allowance is exhausted. Wait for renewal or have the owner explicitly approve paid usage in Azure. Retrying cannot resume this database; no billing setting was changed.')
    process.exitCode = 1
  }
}
