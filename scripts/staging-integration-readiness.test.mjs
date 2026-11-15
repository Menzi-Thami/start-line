import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagingReadiness } from './staging-integration-readiness.mjs'

const names = ['AzureAd__ClientId', 'AzureAd__TenantId', 'Strava__ClientId', 'Strava__ClientSecret', 'Strava__RedirectUri',
  'Strava__HookSecret', 'Strava__VerifyToken', 'Strava__SubscriptionId', 'DataProtection__KeyVaultKeyUri', 'Email__BrevoApiKey',
  'Push__PublicKey', 'Push__PrivateKey', 'Push__Subject']
const rows = () => [
  ...names.map(name => ({ name, configured: true })),
  { name: 'Strava__RedirectUri', configured: true, publicValue: 'https://icy-grass-0c32e680f-staging.eastus2.1.azurestaticapps.net/strava/callback' },
  { name: 'Email__ApiBaseUrl', configured: true, publicValue: 'https://app-taperday-api-staging-3ghg5t.azurewebsites.net/' },
  ...['RunnerWeeklyRecap', 'OnboardingReminder', 'UpdateAnnouncement'].flatMap(section => [
    { name: `${section}__Enabled`, configured: true, publicValue: 'false' },
    { name: `${section}__TestTo`, configured: true, publicValue: 'qa@example.test' },
  ]),
]

test('requires every provider setting and an isolated test inbox without returning setting values', () => {
  const report = stagingReadiness(rows(), 'qa@example.test')
  assert.equal(report.ready, true)
  assert.equal(JSON.stringify(report).includes('qa@example.test'), false)
  assert.equal(JSON.stringify(report).includes('azurewebsites.net'), false)
  const missing = stagingReadiness(rows().filter(row => row.name !== 'Strava__ClientSecret'), 'qa@example.test')
  assert.equal(missing.ready, false)
  assert.deepEqual(missing.checks[1].missing, ['Strava__ClientSecret'])
})

test('rejects production callbacks and email links', () => {
  const settings = rows().map(row => row.name === 'Strava__RedirectUri' ? { ...row, publicValue: 'https://taperday.run/strava/callback' }
    : row.name === 'Email__ApiBaseUrl' ? { ...row, publicValue: 'https://app-taperday-api-3ghg5t.azurewebsites.net' } : row)
  const result = stagingReadiness(settings, 'qa@example.test')
  assert.equal(result.ready, false)
  assert.equal(result.checks.find(check => check.name === 'Strava returns to staging').ready, false)
  assert.equal(result.checks.find(check => check.name === 'Email unsubscribe links stay on staging').ready, false)
})

test('a preview recipient does not make an enabled mail campaign isolated', () => {
  const result = stagingReadiness(rows().map(row => row.name === 'OnboardingReminder__Enabled' ? { ...row, publicValue: 'true' } : row), 'qa@example.test')
  assert.equal(result.ready, false)
})

test('missing or different test recipients remain incomplete', () => {
  assert.equal(stagingReadiness(rows(), undefined).ready, false)
  assert.equal(stagingReadiness(rows(), 'another@example.test').ready, false)
  assert.equal(stagingReadiness([], 'qa@example.test').ready, false)
})
