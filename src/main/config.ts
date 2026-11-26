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
  appearance: 'light',
  sidebarCard: 'heatmap'
}

/** Last main-window size, kept out of the renderer-facing config. */
export interface WindowState {
  width: number
  height: number
}

interface StoredConfig extends AppConfig {
  windowState?: WindowState
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
      sidebarCard: raw.sidebarCard === 'calendar' ? 'calendar' : 'heatmap',
      ...(typeof raw.refreshToken === 'string' && raw.refreshToken ? { refreshToken: raw.refreshToken } : {}),
      ...(raw.windowState && typeof raw.windowState.width === 'number' && typeof raw.windowState.height === 'number'
        ? { windowState: { width: raw.windowState.width, height: raw.windowState.height } }
        : {})
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
  const { refreshToken: _secret, windowState: _window, ...publicPart } = read()
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

const MIN_WIDTH = 760
const MIN_HEIGHT = 460

/** Restores the last window size, clamped to the minimums enforced by the window itself. */
export function loadWindowState(): WindowState | null {
  const state = read().windowState
  if (!state) return null
  return {
    width: Math.max(MIN_WIDTH, Math.round(state.width)),
    height: Math.max(MIN_HEIGHT, Math.round(state.height))
  }
}

export function saveWindowState(state: WindowState): void {
  const current = read()
  const next: StoredConfig = {
    ...current,
    windowState: {
      width: Math.max(MIN_WIDTH, Math.round(state.width)),
      height: Math.max(MIN_HEIGHT, Math.round(state.height))
    }
  }
  write(next)
}
