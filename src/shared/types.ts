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
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number }

export interface AppConfig {
  /** Server base URL, e.g. `https://memos.example.com`. No trailing slash. */
  serverUrl: string
  /** Last username, so the sign-in form can prefill it. */
  username: string
  /** Electron accelerator for the quick-capture window. */
  quickHotkey: string
  launchAtLogin: boolean
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
