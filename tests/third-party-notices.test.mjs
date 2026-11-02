import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateNotices } from '../scripts/third-party-notices.mjs'

test('本番依存のライセンスとNOTICEを収集し、本文不足を報告する', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sd-license-test-'))
  const pkg = join(root, 'node_modules', 'example')
  await mkdir(pkg, { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0', license: 'MIT' }))
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/example': { version: '1.0.0' } } }))
  await assert.rejects(() => generateNotices(root), /example/)
  await writeFile(join(pkg, 'LICENSE-MIT.txt'), 'License text')
  await writeFile(join(pkg, 'NOTICE'), 'Required notice')
  const result = await generateNotices(root)
  assert.match(result, /example@1\.0\.0/)
  assert.match(result, /License text/)
  assert.match(result, /Required notice/)
  assert.equal(await readFile(join(pkg, 'LICENSE-MIT.txt'), 'utf8'), 'License text')
})
