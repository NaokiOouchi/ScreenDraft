export function resolveSigningConfig(env) {
  const identity = env.SCREENDRAFT_SIGNING_IDENTITY?.trim()
  const teamId = env.APPLE_TEAM_ID?.trim()
  if (!identity) throw new Error('SCREENDRAFT_SIGNING_IDENTITYを指定してください。')
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) throw new Error('有効なAPPLE_TEAM_IDを指定してください。')
  return { identity, teamId }
}

export function validateSigningIdentity(details, config) {
  const lines = details.split(/\r?\n/)
  const name = config.identity.replace(/ \([A-Z0-9]{10}\)$/, '')
  const expected = `Authority=Developer ID Application: ${name} (${config.teamId})`
  return lines.includes(expected) && lines.includes(`TeamIdentifier=${config.teamId}`) && /flags=.*\bruntime\b/.test(details)
}
