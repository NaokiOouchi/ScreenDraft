import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { resolveSigningConfig, validateSigningIdentity } from './signing-config.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const profile = process.env.APPLE_KEYCHAIN_PROFILE
const output = join(root, 'release-signed')
const app = join(output, 'mac-arm64/ScreenDraft.app')
const dmg = join(output, `ScreenDraft-${version}-arm64.dmg`)
const auth = ['--keychain-profile', profile || '']
if (process.env.APPLE_KEYCHAIN) auth.push('--keychain', process.env.APPLE_KEYCHAIN)

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout || '')
    throw new Error(`${command} が失敗しました。公証済みの配布物として使用しないでください。`)
  }
  return result.stdout
}

function notarize(file) {
  const result = JSON.parse(run('xcrun', [
    'notarytool', 'submit', file, ...auth, '--wait', '--output-format', 'json',
  ], true))
  console.log(`${file}: ${result.status} (${result.id})`)
  if (result.status !== 'Accepted') {
    run('xcrun', ['notarytool', 'log', result.id, ...auth])
    throw new Error('Appleの公証に合格しませんでした。')
  }
  return { id: result.id, status: result.status }
}

try {
  const signing = resolveSigningConfig(process.env)
  if (!profile) throw new Error('APPLE_KEYCHAIN_PROFILEを指定してください。')
  // 認証情報の値は取得せず、登録済みプロファイルで認証を確認する。
  run('xcrun', ['notarytool', 'history', ...auth, '--output-format', 'json'], true)
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  // codesignの詳細はstderrに出力されるため、TeamIdentifierは別途確認する。
  const detail = spawnSync('codesign', ['-d', '--verbose=2', app], { encoding: 'utf8' })
  if (detail.status !== 0 || !validateSigningIdentity(detail.stderr, signing)) {
    throw new Error('配布チームのDeveloper ID署名とHardened Runtimeを確認できません。')
  }
  const archive = join(mkdtempSync(join(tmpdir(), 'screendraft-notary-')), 'ScreenDraft.zip')
  run('ditto', ['-c', '-k', '--keepParent', app, archive])
  const appResult = notarize(archive)
  run('xcrun', ['stapler', 'staple', app])
  run('xcrun', ['stapler', 'validate', app])
  run(join(root, 'node_modules/.bin/electron-builder'), [
    '--config', 'electron-builder.signed.cjs', '--prepackaged', app, '--mac', 'dmg', '--arm64',
  ])
  const dmgResult = notarize(dmg)
  run('xcrun', ['stapler', 'staple', dmg])
  run('xcrun', ['stapler', 'validate', dmg])
  // チケット添付前のDMGから生成された古い差分更新ファイルは配布しない。
  rmSync(dmg + '.blockmap', { force: true })
  run('spctl', ['--assess', '--type', 'execute', '--verbose=4', app])
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', dmg])
  const sha256 = createHash('sha256').update(readFileSync(dmg)).digest('hex')
  writeFileSync(join(output, 'notarization.json'), JSON.stringify({
    version, team: signing.teamId, verifiedAt: new Date().toISOString(), app: appResult, dmg: dmgResult, sha256,
  }, null, 2) + '\n')
  console.log(`公証・チケット添付・Gatekeeper検証完了: ${dmg}\nSHA-256: ${sha256}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
