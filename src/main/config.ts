import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig, TagColorKey, TagMetaEntry, TagMetaMap } from '../shared/types'

const DEFAULTS: AppConfig = {
  serverUrl: '',
  username: '',
  quickHotkey: 'CommandOrControl+Shift+M',
  launchAtLogin: false,
  theme: 'classic',
  appearance: 'light',
  sidebarCard: 'heatmap',
  fontSize: 14,
  tagMeta: {}
}

const TAG_COLORS: TagColorKey[] = ['tone-1', 'tone-2', 'tone-3', 'tone-4']

/** Keeps whatever the renderer (or a hand-edited file) wrote within the shape we understand. */
function sanitizeTagMeta(raw: unknown): TagMetaMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: TagMetaMap = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!name || !value || typeof value !== 'object') continue
    const entry = value as { color?: unknown; pinned?: unknown }
    const next: TagMetaEntry = {}
    if (typeof entry.color === 'string' && TAG_COLORS.includes(entry.color as TagColorKey)) {
      next.color = entry.color as TagColorKey
    }
    if (entry.pinned === true) next.pinned = true
    if (Object.keys(next).length > 0) out[name] = next
  }
  return out
}

/** Last main-window size, kept out of the renderer-facing config. */
export interface WindowState {
  width: number
  height: number
}

/**
 * One-off migration: an earlier build kept the archive bucket in `archivedMemos` because the API
 * was assumed to have no such flag. It does (`state`), so the names are pushed to the server once
 * and the key is dropped afterwards — reading and clearing are separate steps so a failed write
 * leaves the list intact for the next launch.
 */
export function readLegacyArchived(): string[] {
  const file = configPath()
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { archivedMemos?: unknown }
    if (!Array.isArray(raw.archivedMemos)) return []
    return raw.archivedMemos.filter((value): value is string => typeof value === 'string' && value.startsWith('memos/'))
  } catch {
    return []
  }
}

export function clearLegacyArchived(): void {
  const file = configPath()
  if (!existsSync(file)) return
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { archivedMemos?: unknown }
    if (!('archivedMemos' in raw)) return
    delete raw.archivedMemos
    writeFileSync(file, JSON.stringify(raw, null, 2), 'utf-8')
    cached = null
  } catch {
    /* a malformed file simply keeps the key until the next save rewrites it */
  }
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
      theme: raw.theme === 'minimal' ? 'minimal' : raw.theme === 'checklist' ? 'checklist' : 'classic',
      appearance: raw.appearance === 'dark' || raw.appearance === 'system' ? raw.appearance : 'light',
      sidebarCard: raw.sidebarCard === 'calendar' ? 'calendar' : 'heatmap',
      // 字号只允许 12–20px，防止手改配置文件时把界面撑爆。
      fontSize: typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)
        ? Math.min(20, Math.max(12, Math.round(raw.fontSize)))
        : DEFAULTS.fontSize,
      tagMeta: sanitizeTagMeta(raw.tagMeta),
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
  writeFileSync(file, JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 })
  // writeFileSync only applies `mode` when it creates the file; keep hand-made files private too.
  try {
    chmodSync(file, 0o600)
  } catch {
    /* best effort — a filesystem without POSIX modes should not break saving */
  }
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
  next.tagMeta = sanitizeTagMeta(next.tagMeta)
  write(next)
  return loadConfig()
}

/**
 * The refresh token is a rotating cookie the server hands back after sign-in.
 *
 * It used to go through `safeStorage`, but on macOS that keeps its key in the login keychain with an
 * ACL bound to the code signature: an unsigned or ad-hoc signed build looks like a *different* app
 * to the keychain, so macOS asked for the keychain password on every launch — and because the request
 * is synchronous, the main process stalled before the window could even be shown.
 *
 * We therefore keep it in config.json (mode 0600, same trust boundary as a browser's cookie jar)
 * instead of asking the OS for a secret on startup.
 */
export function loadRefreshToken(): string | null {
  const stored = read().refreshToken
  if (!stored) return null
  try {
    return Buffer.from(stored, 'base64').toString('utf-8') || null
  } catch {
    return null
  }
}

export function saveRefreshToken(token: string | null): void {
  const next: StoredConfig = { ...read() }
  if (!token) delete next.refreshToken
  else next.refreshToken = Buffer.from(token, 'utf-8').toString('base64')
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
