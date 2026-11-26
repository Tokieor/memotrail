import { app, ipcMain } from 'electron'
import { loadConfig, saveConfig } from './config'
import * as memos from './memos/client'
import type { AppConfig, ListMemosOptions, QuickCapturePayload, Visibility } from '../shared/types'
import { hideQuickWindow, showQuickWindow } from './windows'
import { registerQuickHotkey } from './hotkeys'

/** Only the app's own pages may talk to these handlers. */
function trusted(event: Electron.IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  return url.startsWith('file://') || url.startsWith('http://localhost') || url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\u0000')
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error(`Refused IPC from an untrusted frame: ${channel}`)
    return fn(...(args as A))
  })
}

export function registerIpc(): void {
  handle('config:get', () => loadConfig())
  handle('config:set', (patch: Partial<AppConfig>) => {
    const next = saveConfig(patch)
    if (patch.quickHotkey !== undefined) registerQuickHotkey(next.quickHotkey)
    if (patch.launchAtLogin !== undefined && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
    }
    return next
  })

  handle('auth:signin', async (serverUrl: string, username: string, password: string) => {
    const result = await memos.signIn(serverUrl, username, password)
    if (result.success) saveConfig({ serverUrl, username })
    return result
  })
  handle('auth:status', async () => {
    if (!memos.hasSession()) return { success: true as const, data: null }
    return memos.currentUser()
  })
  handle('auth:signout', () => {
    memos.signOut()
    return { success: true as const, data: undefined }
  })

  handle('memos:list', (options: ListMemosOptions) => memos.listMemos(options))
  handle('memos:create', (content: string, visibility?: Visibility) => memos.createMemo(content, visibility))

  handle('quick:capture', async (payload: QuickCapturePayload) => {
    const result = await memos.createMemo(payload.content, payload.visibility)
    if (result.success) hideQuickWindow()
    return result
  })
  handle('quick:hide', () => hideQuickWindow())
  handle('quick:show', () => {
    showQuickWindow()
  })
}
