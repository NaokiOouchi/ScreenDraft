import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSigningConfig, validateSigningIdentity } from '../scripts/signing-config.mjs'

test('署名情報は環境から指定し、省略時は停止する', () => {
  assert.throws(() => resolveSigningConfig({}), /SCREENDRAFT_SIGNING_IDENTITY/)
  assert.throws(() => resolveSigningConfig({ SCREENDRAFT_SIGNING_IDENTITY: 'Test' }), /APPLE_TEAM_ID/)
  assert.deepEqual(resolveSigningConfig({ SCREENDRAFT_SIGNING_IDENTITY: 'Developer Name', APPLE_TEAM_ID: 'AB12CD34EF' }), { identity: 'Developer Name', teamId: 'AB12CD34EF' })
})

test('署名者とチーム、Hardened Runtimeが指定と一致しない場合は拒否する', () => {
  const config = { identity: 'Developer Name', teamId: 'AB12CD34EF' }
  const details = 'Authority=Developer ID Application: Developer Name (AB12CD34EF)\nTeamIdentifier=AB12CD34EF\nflags=0x10000(runtime)\n'
  assert.equal(validateSigningIdentity(details, config), true)
  assert.equal(validateSigningIdentity(details.replace('TeamIdentifier=AB12CD34EF', 'TeamIdentifier=OTHER00000'), config), false)
  assert.equal(validateSigningIdentity(details.replace('(runtime)', '(none)'), config), false)
  assert.equal(validateSigningIdentity(details.replace('Developer Name', 'Another Name'), config), false)
})
