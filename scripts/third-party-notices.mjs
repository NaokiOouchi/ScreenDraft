import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const noticeName = /^(?:licen[sc]e|copying|notice)(?:[.\-_].*)?$/i

export async function generateNotices(root) {
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  const sections = []
  const missing = []
  for (const [relative, item] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!relative.includes('node_modules/') || item.dev === true) continue
    const dir = join(root, relative)
    let pkg
    try { pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT' && item.optional) continue; throw error }
    const files = []
    for (const name of (await readdir(dir)).filter(name => noticeName.test(name)).sort()) {
      if ((await stat(join(dir, name))).isFile()) files.push([name, await readFile(join(dir, name), 'utf8')])
    }
    if (!files.length && ['@esbuild/darwin-arm64', '@rollup/rollup-darwin-arm64'].includes(pkg.name)) {
      const parentName = pkg.name.startsWith('@esbuild/') ? 'esbuild' : 'rollup'
      const req = createRequire(join(dir, 'package.json'))
      const parent = dirname(req.resolve(`${parentName}/package.json`))
      const parentPkg = JSON.parse(await readFile(join(parent, 'package.json'), 'utf8'))
      if (parentPkg.version !== pkg.version) throw new Error(`${pkg.name}: 親パッケージのバージョンが一致しません`)
      files.push([`${parentName}/LICENSE.md`, await readFile(join(parent, 'LICENSE.md'), 'utf8')])
    }
    if (!files.length && pkg.name === 'abstract-logging' && pkg.version === '2.0.1') {
      files.push(['abstract-logging-MIT.txt', await readFile(join(root, 'licenses/third-party/abstract-logging-MIT.txt'), 'utf8')])
    }
    if (!files.some(([name]) => /^(?:licen[sc]e|copying|.*\/licen[sc]e|abstract-logging-MIT)/i.test(name))) {
      missing.push(`${pkg.name}@${pkg.version}`)
      continue
    }
    sections.push(`${pkg.name}@${pkg.version} (${pkg.license || 'unknown'})\n${files.map(([name, text]) => `--- ${name} ---\n${text.trim()}\n`).join('\n')}`)
  }
  if (missing.length) throw new Error(`ライセンス本文が見つかりません: ${missing.join(', ')}`)
  return `ScreenDraft third-party notices\n\nThis file lists installed production dependencies, including packages that may not be used in every build. Electron and Chromium notices are supplied separately in LICENSE.electron.txt and LICENSES.chromium.html in the app resources.\n\n${sections.join('\n============================================================\n\n')}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd()
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), await generateNotices(root))
  console.log('Third-party notices: THIRD_PARTY_NOTICES.txt')
}
