import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, ListMemosOptions, Memo, MemoList, QuickCapturePayload, User, Visibility } from '../shared/types'

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:set', patch)
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
      ipcRenderer.invoke('memos:create', content, visibility) as Promise<{ success: boolean; data?: Memo; error?: string }>
  },
  quick: {
    capture: (payload: QuickCapturePayload) =>
      ipcRenderer.invoke('quick:capture', payload) as Promise<{ success: boolean; data?: Memo; error?: string }>,
    hide: () => ipcRenderer.invoke('quick:hide'),
    show: () => ipcRenderer.invoke('quick:show')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type MemoTrailApi = typeof api
