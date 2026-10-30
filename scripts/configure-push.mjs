import { createECDH } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Never rotate an existing pair: doing so would invalidate runners' subscriptions.
export function missingPushSettings(current, generate) {
  const publicKey = current.Push__PublicKey?.trim()
  const privateKey = current.Push__PrivateKey?.trim()
  if (Boolean(publicKey) !== Boolean(privateKey)) throw new Error('Incomplete VAPID pair')
  const settings = publicKey ? {} : generate()
  if (!current.Push__Subject?.trim()) settings.Push__Subject = 'mailto:info@taperday.run'
  return settings
}

function configure() {
  const name = process.env.API_APP_NAME
  if (!name) throw new Error('API_APP_NAME is required')
  const args = ['webapp', 'config', 'appsettings']
  const target = ['-g', 'rg-taperday', '-n', name]
  const current = JSON.parse(execFileSync('az', [...args, 'list', ...target,
    '--query', "[?starts_with(name, 'Push__')]", '--output', 'json'], { encoding: 'utf8' }))
  const settings = missingPushSettings(Object.fromEntries(current.map(s => [s.name, s.value])), () => {
    const keys = createECDH('prime256v1')
    keys.generateKeys()
    const privateKey = keys.getPrivateKey()
    return {
      Push__PublicKey: keys.getPublicKey().toString('base64url'),
      Push__PrivateKey: Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]).toString('base64url'),
    }
  })
  if (Object.keys(settings).length) {
    const directory = mkdtempSync(join(tmpdir(), 'taperday-push-'))
    try {
      const path = join(directory, 'settings.json')
      writeFileSync(path, JSON.stringify(settings), { mode: 0o600 })
      execFileSync('az', [...args, 'set', ...target, '--settings', `@${path}`, '--output', 'none'], { stdio: 'pipe' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  console.log('Push delivery settings configured; existing VAPID keys preserved. Values are not logged.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { configure() } catch {
    console.error('Push configuration failed. Check Azure access and whether only one VAPID key is configured. No keys were logged.')
    process.exitCode = 1
  }
}
