import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '../shared/types'

const DEFAULTS: AppConfig = {
  serverUrl: '',
  username: '',
  quickHotkey: 'CommandOrControl+Shift+M',
  launchAtLogin: false,
  theme: 'classic',
  appearance: 'light'
}

interface StoredConfig extends AppConfig {
  /** base64 of the OS-encrypted `memos_refresh` cookie; never handed to the renderer. */
  refreshToken?: string
}

let cached: StoredConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function read(): StoredConfig {
  if (cached) return cached
  const file = configPath()
  if (!existsSync(file)) {
    cached = { ...DEFAULTS }
    return cached
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<StoredConfig>
    cached = {
      serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl.replace(/\/+$/, '') : DEFAULTS.serverUrl,
      username: typeof raw.username === 'string' ? raw.username : DEFAULTS.username,
      quickHotkey: typeof raw.quickHotkey === 'string' && raw.quickHotkey ? raw.quickHotkey : DEFAULTS.quickHotkey,
      launchAtLogin: raw.launchAtLogin === true,
      theme: raw.theme === 'minimal' ? 'minimal' : 'classic',
      appearance: raw.appearance === 'dark' || raw.appearance === 'system' ? raw.appearance : 'light',
      ...(typeof raw.refreshToken === 'string' && raw.refreshToken ? { refreshToken: raw.refreshToken } : {})
    }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

function write(next: StoredConfig): void {
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
  cached = next
}

/** The renderer only ever sees the non-secret part of the config. */
export function loadConfig(): AppConfig {
  const { refreshToken: _secret, ...publicPart } = read()
  return publicPart
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next: StoredConfig = { ...read(), ...patch }
  if (typeof next.serverUrl === 'string') next.serverUrl = next.serverUrl.trim().replace(/\/+$/, '')
  write(next)
  return loadConfig()
}

export function loadRefreshToken(): string | null {
  const stored = read().refreshToken
  if (!stored) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

export function saveRefreshToken(token: string | null): void {
  const next: StoredConfig = { ...read() }
  if (!token) delete next.refreshToken
  else if (safeStorage.isEncryptionAvailable()) {
    next.refreshToken = safeStorage.encryptString(token).toString('base64')
  } else {
    // Linux without a keyring: keep it in memory only rather than writing plaintext.
    delete next.refreshToken
  }
  write(next)
}
