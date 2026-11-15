import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SITE = 'https://icy-grass-0c32e680f-staging.eastus2.1.azurestaticapps.net'
const API = 'https://app-taperday-api-staging-3ghg5t.azurewebsites.net'
const publicNames = ['Strava__RedirectUri', 'Email__ApiBaseUrl', 'RunnerWeeklyRecap__Enabled',
  'OnboardingReminder__Enabled', 'UpdateAnnouncement__Enabled', 'RunnerWeeklyRecap__TestTo',
  'OnboardingReminder__TestTo', 'UpdateAnnouncement__TestTo']

/** Input is already redacted by Azure CLI: secrets have a configured flag, never a value. */
export function stagingReadiness(rows, testEmail) {
  const settings = new Map(rows.map(row => [row.name.replaceAll(':', '__'), row]))
  const present = name => settings.get(name)?.configured === true
  const value = name => settings.get(name)?.publicValue?.trim() ?? ''
  const check = (name, names) => ({ name, ready: names.every(present), missing: names.filter(key => !present(key)) })
  const checks = [
    check('Entra account configuration', ['AzureAd__ClientId', 'AzureAd__TenantId']),
    check('Strava application and webhook configuration', ['Strava__ClientId', 'Strava__ClientSecret', 'Strava__RedirectUri',
      'Strava__HookSecret', 'Strava__VerifyToken', 'Strava__SubscriptionId', 'DataProtection__KeyVaultKeyUri']),
    check('Email provider configuration', ['Email__BrevoApiKey']),
    check('Push configuration', ['Push__PublicKey', 'Push__PrivateKey', 'Push__Subject', 'DataProtection__KeyVaultKeyUri']),
  ]
  checks.push({ name: 'Strava returns to staging', ready: value('Strava__RedirectUri') === `${SITE}/strava/callback` })
  checks.push({ name: 'Email unsubscribe links stay on staging', ready: value('Email__ApiBaseUrl').replace(/\/$/, '') === API })
  const cohorts = ['RunnerWeeklyRecap', 'OnboardingReminder', 'UpdateAnnouncement']
  checks.push({ name: 'Scheduled email campaigns stay disabled during isolated previews',
    ready: cohorts.every(section => !value(`${section}__Enabled`) || value(`${section}__Enabled`).toLowerCase() === 'false') })
  checks.push({ name: 'Email previews target the dedicated test inbox', ready: !!testEmail?.trim()
    && cohorts.every(section => value(`${section}__TestTo`).toLowerCase() === testEmail.trim().toLowerCase()) })
  return { ready: checks.every(item => item.ready), checks }
}

export function readStagingSettings() {
  // Only non-secret callback/recipient switches leave az. No setting values, credentials or tokens are printed.
  const query = `[].{name:name,configured: value != \`null\` && value != '',publicValue: contains(\`${JSON.stringify(publicNames)}\`, name) && value || ''}`
  let output
  try {
    output = execFileSync('az', ['webapp', 'config', 'appsettings', 'list', '--resource-group', 'rg-taperday',
      '--name', 'app-taperday-api-staging-3ghg5t', '--query', query, '--output', 'json', '--only-show-errors'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch { throw new Error('Could not read staging configuration. Sign in to Azure with access to the staging app.') }
  try { return JSON.parse(output) } catch { throw new Error('Azure did not return a readable configuration report.') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = stagingReadiness(readStagingSettings(), process.env.INTEGRATION_TEST_EMAIL)
    console.log(JSON.stringify(report, null, 2))
    console.log('Configuration checks only. Record actual sign-in, sync, delivery and physical-device results separately.')
    if (!report.ready) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
