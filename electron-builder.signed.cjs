const { build } = require('./package.json')
const { resolveSigningConfig } = require('./scripts/signing-config.mjs')
const { identity } = resolveSigningConfig(process.env)

module.exports = {
  ...build,
  forceCodeSigning: true,
  directories: { ...build.directories, output: 'release-signed' },
  dmg: { ...build.dmg, sign: true, writeUpdateInfo: false },
  mac: {
    ...build.mac,
    identity,
    hardenedRuntime: true,
    entitlements: 'desktop/entitlements.mac.plist',
    entitlementsInherit: 'desktop/entitlements.mac.plist',
    notarize: false,
  },
}
