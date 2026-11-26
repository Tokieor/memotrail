// Types shared by the main process, the preload bridge and the renderer.

export type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC' | 'SPACE'

/** A memo as the Memos API (26.x, `/api/memos`) returns it. */
export interface Memo {
  /** Resource name: `memos/{id}`. */
  name: string
  /** Resource name of the author: `users/{id}`. */
  creator: string
  content: string
  visibility: Visibility
  createTime?: string
  updateTime?: string
  pinned?: boolean
  tags?: string[]
}

export interface MemoList {
  memos: Memo[]
  nextPageToken?: string
}

export interface User {
  name: string
  username: string
  displayName?: string
  avatarUrl?: string
  /** The account's preferred visibility, used to preselect the quick-capture default. */
  defaultVisibility?: string
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number }

/** Visual style preset: `classic` keeps the sage accent, `minimal` is pure black/white/grey. */
export type ThemeId = 'classic' | 'minimal'

/** Colour scheme preference; `system` follows the OS. */
export type Appearance = 'light' | 'dark' | 'system'

/** Which card sits above the sidebar navigation. */
export type SidebarCard = 'heatmap' | 'calendar'

/** Colour keys a tag can be assigned; they resolve to the theme's `--tone-N` variables. */
export type TagColorKey = 'tone-1' | 'tone-2' | 'tone-3' | 'tone-4'

export interface TagMetaEntry {
  color?: TagColorKey
  pinned?: boolean
}

/** Per-tag UI preferences that the Memos server knows nothing about. Keyed by tag name. */
export type TagMetaMap = Record<string, TagMetaEntry>

export interface AppConfig {
  /** Server base URL, e.g. `https://memos.example.com`. No trailing slash. */
  serverUrl: string
  /** Last username, so the sign-in form can prefill it. */
  username: string
  /** Electron accelerator for the quick-capture window. */
  quickHotkey: string
  launchAtLogin: boolean
  theme: ThemeId
  appearance: Appearance
  sidebarCard: SidebarCard
  /** Tag colours and pins, kept locally because the API has no place for them. */
  tagMeta: TagMetaMap
}

export interface ListMemosOptions {
  pageSize?: number
  pageToken?: string
  /** CEL filter, e.g. `pinned` or `"work" in tags`. */
  filter?: string
}

export interface QuickCapturePayload {
  content: string
  visibility?: Visibility
}
