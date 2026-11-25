import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { monthlySqlQuotaExhausted } from './migration-failure.mjs'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('monthly free allowance exhaustion stops rather than retrying for eight minutes', () => {
  assert.equal(monthlySqlQuotaExhausted('Error Number:42119,State:1,Class:20'), true)
  assert.equal(monthlySqlQuotaExhausted('This database has reached the monthly free amount allowance and is paused for the remainder of the month.'), true)
})
test('normal cold-start and temporary firewall errors keep their existing retry window', () => {
  for (const message of ['Error Number:40613,State:1', 'Error Number:40615,State:1', 'A connection timeout occurred.']) {
    assert.equal(monthlySqlQuotaExhausted(message), false)
  }
})
test('an unrelated log number is not mistaken for the SQL error code', () => {
  assert.equal(monthlySqlQuotaExhausted('Build 42119 succeeded.'), false)
})

function runMigration(mode) {
  const root = mkdtempSync(join(tmpdir(), 'taperday-migration-test-'))
  try {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    mkdirSync(join(root, 'scripts'))
    copyFileSync(fileURLToPath(new URL('./migration-failure.mjs', import.meta.url)), join(root, 'scripts/migration-failure.mjs'))
    const dotnet = join(bin, 'dotnet')
    writeFileSync(dotnet, `#!/usr/bin/env bash
if [ "$1" = "build" ]; then exit 0; fi
count=0
if [ -f "$MIGRATION_TEST_COUNTER" ]; then count=$(cat "$MIGRATION_TEST_COUNTER"); fi
count=$((count + 1))
echo "$count" > "$MIGRATION_TEST_COUNTER"
if [ "$MIGRATION_TEST_MODE" = "success" ] || { [ "$MIGRATION_TEST_MODE" = "transient" ] && [ "$count" -ge 2 ]; }; then exit 0; fi
if [ "$MIGRATION_TEST_MODE" = "quota" ]; then echo 'Error Number:42119,State:1'; else echo 'Error Number:40615,State:1'; fi
exit 1
`)
    chmodSync(dotnet, 0o755)
    writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(join(bin, 'sleep'), 0o755)
    const workflow = readFileSync(new URL('../.github/workflows/deploy-environment.yml', import.meta.url), 'utf8')
    const block = workflow.match(/- name: Migrate database\n\s+run: \|\n([\s\S]*?)\n\s+- name:/)?.[1]
    assert.ok(block, 'The actual workflow migration block must be tested')
    const script = block.replace(/^ {10}/gm, '').replaceAll('${{ vars.SQL_SERVER }}', 'local-test').replaceAll('${{ vars.SQL_DATABASE }}', 'TestOnly')
    const counter = join(root, 'attempts')
    const result = spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: root, MIGRATION_TEST_MODE: mode, MIGRATION_TEST_COUNTER: counter } })
    assert.ifError(result.error)
    return { ...result, attempts: Number(readFileSync(counter, 'utf8')) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('the actual workflow propagates a quota failure through tee and stops before retry/deployment', () => {
  const result = runMigration('quota')
  assert.equal(result.status, 1)
  assert.equal(result.attempts, 1)
  assert.match(result.stderr, /monthly free allowance is exhausted/)
})
test('the actual workflow still retries a temporary firewall failure successfully', () => {
  const result = runMigration('transient')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.attempts, 2)
})
test('the actual workflow accepts a successful migration immediately', () => {
  const result = runMigration('success')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.attempts, 1)
})
