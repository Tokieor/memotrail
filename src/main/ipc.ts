import { app, ipcMain } from 'electron'
import { loadConfig, saveConfig } from './config'
import * as memos from './memos/client'
import type { AppConfig, ListMemosOptions, QuickCapturePayload, Visibility } from '../shared/types'
import { broadcast, getMainWindow, hideQuickWindow, showMainWindow, showQuickWindow } from './windows'
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

/** Tells the timeline to reload after a write, wherever it came from. */
function broadcastChange(): void {
  getMainWindow()?.webContents.send('memos:changed')
}

export function registerIpc(): void {
  handle('config:get', () => loadConfig())
  handle('config:set', (patch: Partial<AppConfig>) => {
    const previous = loadConfig()
    const next = saveConfig(patch)
    if (patch.quickHotkey !== undefined && patch.quickHotkey !== previous.quickHotkey) {
      if (!registerQuickHotkey(next.quickHotkey)) {
        const reverted = saveConfig({ quickHotkey: previous.quickHotkey })
        registerQuickHotkey(reverted.quickHotkey)
        throw new Error(`快捷键 ${patch.quickHotkey} 被系统或其它应用占用，已恢复为 ${reverted.quickHotkey}`)
      }
    }
    if (patch.launchAtLogin !== undefined && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
    }
    broadcast('config:changed', next)
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
  handle('attachments:upload', (payload: { filename: string; type: string; data: string }) =>
    memos.uploadAttachment(payload.filename, payload.type, payload.data)
  )
  handle('memos:update', async (name: string, patch: memos.MemoPatch) => {
    const result = await memos.updateMemo(name, patch)
    if (result.success) broadcastChange()
    return result
  })
  handle('memos:delete', async (name: string) => {
    const result = await memos.deleteMemo(name)
    if (result.success) broadcastChange()
    return result
  })
  handle('memos:create', async (content: string, visibility?: Visibility) => {
    const result = await memos.createMemo(content, visibility)
    if (result.success) broadcastChange()
    return result
  })

  handle('quick:capture', async (payload: QuickCapturePayload) => {
    const result = await memos.createMemo(payload.content, payload.visibility)
    if (result.success) {
      broadcastChange()
      hideQuickWindow()
    }
    return result
  })
  handle('quick:hide', () => hideQuickWindow())
  handle('quick:show', () => {
    showQuickWindow()
  })
  handle('quick:show-main', () => {
    showMainWindow()
  })
}
