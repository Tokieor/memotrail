import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '../shared/types'

const DEFAULTS: AppConfig = {
  serverUrl: '',
  username: '',
  quickHotkey: 'CommandOrControl+Shift+M',
  launchAtLogin: false
}

let cached: AppConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  if (cached) return cached
  const file = configPath()
  if (!existsSync(file)) {
    cached = { ...DEFAULTS }
    return cached
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppConfig>
    cached = {
      serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl.replace(/\/+$/, '') : DEFAULTS.serverUrl,
      username: typeof raw.username === 'string' ? raw.username : DEFAULTS.username,
      quickHotkey: typeof raw.quickHotkey === 'string' && raw.quickHotkey ? raw.quickHotkey : DEFAULTS.quickHotkey,
      launchAtLogin: raw.launchAtLogin === true
    }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...loadConfig(), ...patch }
  if (typeof next.serverUrl === 'string') next.serverUrl = next.serverUrl.trim().replace(/\/+$/, '')
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
  cached = next
  return next
}
