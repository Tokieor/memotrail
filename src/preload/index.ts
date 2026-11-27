import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, ListMemosOptions, Memo, MemoList, MemoState, QuickCapturePayload, User, Visibility } from '../shared/types'

const api = {
  /** Host OS, used by the renderer to adapt layout (macOS traffic lights need top inset). */
  platform: process.platform,
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:set', patch),
    onChange: (callback: (config: AppConfig) => void) => {
      const listener = (_event: unknown, config: AppConfig): void => callback(config)
      ipcRenderer.on('config:changed', listener)
      return () => {
        ipcRenderer.removeListener('config:changed', listener)
      }
    }
  },
  auth: {
    signIn: (serverUrl: string, username: string, password: string) =>
      ipcRenderer.invoke('auth:signin', serverUrl, username, password),
    status: () => ipcRenderer.invoke('auth:status') as Promise<{ success: boolean; data?: User | null; error?: string }>,
    signOut: () => ipcRenderer.invoke('auth:signout')
  },
  memos: {
    list: (options: ListMemosOptions = {}) => ipcRenderer.invoke('memos:list', options) as Promise<{ success: boolean; data?: MemoList; error?: string }>,
    create: (content: string, visibility?: Visibility) =>
      ipcRenderer.invoke('memos:create', content, visibility) as Promise<{ success: boolean; data?: Memo; error?: string }>,
    update: (name: string, patch: { content?: string; visibility?: Visibility; pinned?: boolean; state?: MemoState }) =>
      ipcRenderer.invoke('memos:update', name, patch) as Promise<{ success: boolean; data?: Memo; error?: string }>,
    onChange: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('memos:changed', listener)
      return () => {
        ipcRenderer.removeListener('memos:changed', listener)
      }
    },
    remove: (name: string) => ipcRenderer.invoke('memos:delete', name) as Promise<{ success: boolean; error?: string }>
  },
  attachments: {
    upload: (payload: { filename: string; type: string; data: string }) =>
      ipcRenderer.invoke('attachments:upload', payload) as Promise<{
        success: boolean
        data?: { name: string; filename: string; type: string; size: string }
        error?: string
      }>
  },
  quick: {
    capture: (payload: QuickCapturePayload) =>
      ipcRenderer.invoke('quick:capture', payload) as Promise<{ success: boolean; data?: Memo; error?: string }>,
    hide: () => ipcRenderer.invoke('quick:hide'),
    show: () => ipcRenderer.invoke('quick:show'),
    showMain: () => ipcRenderer.invoke('quick:show-main')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type MemoTrailApi = typeof api
