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
  /** 自绘标题栏的窗口按钮（Windows；macOS 仍用系统红绿灯）。 */
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:controls', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:controls', 'toggle-maximize'),
    close: () => ipcRenderer.invoke('window:controls', 'close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    /** 窗口被双击标题区、Win+↑ 或系统手势最大化时同步图标。 */
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const listener = (_event: unknown, maximized: boolean): void => callback(maximized)
      ipcRenderer.on('window:maximized', listener)
      return () => {
        ipcRenderer.removeListener('window:maximized', listener)
      }
    }
  },
  hotkeys: {
    /** 试注册一次再注销，用来判断组合键是否合法 / 是否被占用。 */
    check: (accelerator: string, slot: 'quick' | 'main') =>
      ipcRenderer.invoke('hotkey:check', accelerator, slot) as Promise<'ok' | 'taken' | 'invalid' | 'duplicate'>,
    /** 录制期间挂起自家快捷键，否则系统会先把按键吞掉、录不到。 */
    suspend: () => ipcRenderer.invoke('hotkey:suspend'),
    resume: () => ipcRenderer.invoke('hotkey:resume')
  },
  auth: {    signIn: (serverUrl: string, username: string, password: string) =>
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
  clipboard: {
    /** Falls back to the OS pasteboard when the renderer sees no file for a pasted image. */
    readImage: (): Promise<{ type: string; data: string } | null> => ipcRenderer.invoke('clipboard:read-image')
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
