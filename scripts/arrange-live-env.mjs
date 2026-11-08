import { chmodSync, readFileSync, writeFileSync } from 'node:fs'

export function readEnv(file) {
  let source
  try { source = readFileSync(file, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
  return Object.fromEntries(source.split('\n').filter(line => /^[A-Z_][A-Z0-9_]*=/.test(line)).map(line => {
    const split = line.indexOf('=')
    let value = line.slice(split + 1)
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replaceAll("'\\''", "'")
    return [line.slice(0, split), value]
  }))
}

export function updateEnv(file, values) {
  const merged = { ...readEnv(file), ...values }
  const lines = Object.entries(merged).map(([key, value]) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('Environment values must be single line strings')
    return `${key}='${value.replaceAll("'", "'\\''")}'`
  })
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 })
  chmodSync(file, 0o600)
}
