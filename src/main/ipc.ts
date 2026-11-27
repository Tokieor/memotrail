import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { loadConfig, saveAccessToken, saveConfig, saveRefreshToken } from './config'
import * as memos from './memos/client'
import type { AppConfig, ListMemosOptions, MemoView, MemosVersion, QuickCapturePayload, SessionInfo, ViewDraft, Visibility } from '../shared/types'
import { broadcast, getMainWindow, hideQuickWindow, showMainWindow, showQuickWindow } from './windows'
import { probeAccelerator, registerMainHotkey, registerQuickHotkey, resumeHotkeys, sameAccelerator, suspendHotkeys, type HotkeySlot } from './hotkeys'

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
  // 关于页展示真实包版本，避免各处硬编码导致升级后仍显示旧号。
  handle('app:version', () => app.getVersion())

  // 自绘标题栏的三个按钮：操作的是发请求的那个窗口，不一定是主窗口（登录页也用它）。
  ipcMain.handle('window:controls', (event, action: unknown) => {
    if (!trusted(event)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (action === 'minimize') win.minimize()
    else if (action === 'toggle-maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })
  ipcMain.handle('window:is-maximized', (event) => {
    if (!trusted(event)) return false
    const win = BrowserWindow.fromWebContents(event.sender)
    return !!win && !win.isDestroyed() && win.isMaximized()
  })

  // macOS often offers a screenshot only as a pasteboard image, with no file the renderer can see.
  handle('clipboard:read-image', async (): Promise<{ type: string; data: string } | null> => {
    for (const item of await clipboard.read()) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'))
      if (!type) continue
      // Image MIME types always resolve to a Blob; the union only exists for bookmark entries.
      const blob = (await item.getType(type)) as unknown as Blob
      return { type, data: Buffer.from(await blob.arrayBuffer()).toString('base64') }
    }
    return null
  })
  handle('config:get', () => loadConfig())
  handle('config:set', (patch: Partial<AppConfig>) => {
    const previous = loadConfig()
    const next = saveConfig(patch)

    const changedQuick = patch.quickHotkey !== undefined && patch.quickHotkey !== previous.quickHotkey
    const changedMain = patch.mainHotkey !== undefined && patch.mainHotkey !== previous.mainHotkey
    if (changedQuick || changedMain) {
      // 两个全局快捷键不能相同——后注册的那个必然失败。
      if (sameAccelerator(next.quickHotkey, next.mainHotkey)) {
        saveConfig({ quickHotkey: previous.quickHotkey, mainHotkey: previous.mainHotkey })
        registerQuickHotkey(previous.quickHotkey)
        registerMainHotkey(previous.mainHotkey)
        throw new Error('快速记录与主窗口不能使用同一个快捷键')
      }
      if (changedQuick && !registerQuickHotkey(next.quickHotkey)) {
        saveConfig({ quickHotkey: previous.quickHotkey })
        registerQuickHotkey(previous.quickHotkey)
        throw new Error(`快捷键 ${patch.quickHotkey} 被系统或其它应用占用，已恢复为 ${previous.quickHotkey}`)
      }
      if (changedMain && !registerMainHotkey(next.mainHotkey)) {
        saveConfig({ mainHotkey: previous.mainHotkey })
        registerMainHotkey(previous.mainHotkey)
        throw new Error(`快捷键 ${patch.mainHotkey} 被系统或其它应用占用，已恢复为 ${previous.mainHotkey}`)
      }
    }
    if (patch.launchAtLogin !== undefined && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
    }
    broadcast('config:changed', next)
    return next
  })

  handle('hotkey:check', (accelerator: string, slot: HotkeySlot) => probeAccelerator(accelerator, slot))
  // 录制时挂起自家快捷键，录完立刻恢复（见 hotkeys.ts 里的说明）。
  handle('hotkey:suspend', () => suspendHotkeys())
  handle('hotkey:resume', () => resumeHotkeys())
  handle('auth:signin', async (serverUrl: string, username: string, password: string, memosVersion: MemosVersion) => {
    const result = await memos.signIn(serverUrl, username, password)
    if (result.success) {
      // 密码登录拿到的是短期 access token + 可续期的 refresh cookie，PAT 要清掉以免混用。
      saveAccessToken(null)
      saveConfig({
        serverUrl,
        username,
        authMode: 'password',
        memosVersion,
        serverVersion: result.data.serverVersion
      })
    }
    return result
  })
  handle('auth:signin-token', async (serverUrl: string, token: string, memosVersion: MemosVersion) => {
    const result = await memos.signInWithToken(serverUrl, token)
    if (result.success) {
      // 令牌登录没有续期机制：令牌本身长期有效，持久化后重启直接复用。
      saveRefreshToken(null)
      saveAccessToken(token.trim())
      saveConfig({
        serverUrl,
        username: result.data.user.username,
        authMode: 'token',
        memosVersion,
        serverVersion: result.data.serverVersion
      })
    }
    return result
  })
  handle('auth:status', async () => {
    if (!memos.hasSession()) return { success: true as const, data: null }
    return memos.currentUser()
  })
  // 设置页要按登录方式给出不同说明，但不该看到令牌本体，只回尾四位。
  handle('auth:session', (): SessionInfo => {
    const mode = loadConfig().authMode
    return { mode, tokenTail: mode === 'token' ? memos.tokenTail() : null }
  })
  handle('auth:signout', () => {
    memos.signOut()
    // 两种凭证都要清：换账号时残留的另一个会让下次启动用错身份。
    saveRefreshToken(null)
    saveAccessToken(null)
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

  // 视图是服务端保存的 CEL 筛选，增删改都走官方 UserService。
  handle('views:list', () => memos.listViews())
  handle('views:create', (draft: ViewDraft) => memos.createView(draft))
  handle('views:update', (view: MemoView) => memos.updateView(view))
  handle('views:delete', async (name: string) => {
    const result = await memos.deleteView(name)
    if (result.success) broadcast('views:changed')
    return result
  })
  handle('views:validate', (filter: string) => memos.validateViewFilter(filter))

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
