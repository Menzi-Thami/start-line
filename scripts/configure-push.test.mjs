import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingPushSettings } from './configure-push.mjs'

test('creates keys and contact only when none are configured', () => {
  assert.deepEqual(missingPushSettings({}, () => ({ Push__PublicKey: 'new-public', Push__PrivateKey: 'new-private' })), {
    Push__PublicKey: 'new-public', Push__PrivateKey: 'new-private', Push__Subject: 'mailto:info@taperday.run',
  })
})

test('preserves an existing key pair and contact without generating replacements', () => {
  assert.deepEqual(missingPushSettings({ Push__PublicKey: 'held', Push__PrivateKey: 'held', Push__Subject: 'mailto:held@example.test' }, () => { throw new Error('must not generate') }), {})
})

test('fills only a missing contact for an existing pair', () => {
  assert.deepEqual(missingPushSettings({ Push__PublicKey: 'held', Push__PrivateKey: 'held' }, () => { throw new Error('must not generate') }), { Push__Subject: 'mailto:info@taperday.run' })
})

test('rejects either partial key pair rather than invalidating devices', () => {
  for (const current of [{ Push__PublicKey: 'held' }, { Push__PrivateKey: 'held' }]) {
    assert.throws(() => missingPushSettings(current, () => { throw new Error('must not generate') }), /Incomplete VAPID pair/)
  }
})
