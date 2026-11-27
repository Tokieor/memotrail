import { app, Menu } from 'electron'
import { clearLegacyArchived, loadConfig, loadRefreshToken, readLegacyArchived, saveConfig, saveRefreshToken } from './config'
import { registerMainHotkey, registerQuickHotkey, resumeHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import * as memos from './memos/client'
import { handleFileProtocol, registerFileScheme } from './protocol'
import { createTray } from './tray'
import { allowWindowClose, createMainWindow, showMainWindow, showQuickWindow } from './windows'

registerFileScheme()

const DEFAULT_QUICK_HOTKEY = 'CommandOrControl+Shift+M'
const DEFAULT_MAIN_HOTKEY = 'CommandOrControl+Shift+O'

/**
 * macOS routes ⌘V / ⌘C / ⌘A / ⌘Z through the application menu — with no menu installed those
 * shortcuts silently do nothing, which is why pasting into the editor looked broken. Windows and
 * Linux handle the clipboard keys in the renderer, so they keep the chrome-free look.
 */
function installMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      { role: 'windowMenu' }
    ])
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  installMenu()

  app.on('second-instance', () => {
    showMainWindow()
  })

  void app.whenReady().then(() => {
    const config = loadConfig()
    memos.setRefreshTokenSink((token) => saveRefreshToken(token))

    // Register IPC and create the window FIRST. A slow/unreachable server must never block
    // startup: otherwise config:get never gets a handler and the renderer stays blank.
    handleFileProtocol()
    registerIpc()
    const win = createMainWindow()
    // 兜底：窗口隐藏 / 关闭时若还处在「录制挂起」状态，把快捷键恢复回来。
    win.on('hide', () => resumeHotkeys())
    win.on('close', () => resumeHotkeys())

    // Session restore is a background task — the UI can render (and show Sign-In) meanwhile.
    if (config.serverUrl) {
      memos.setBaseUrl(config.serverUrl)
      // The refresh token is a rotating cookie the server hands back in a response header; we keep
      // it encrypted with the OS keychain so a restart can sign in again without the password.
      memos.setRefreshToken(loadRefreshToken())
      void memos.refresh().then(async (restored) => {
        if (!restored.success) {
          console.warn('[memotrail] no stored session:', restored.error)
          return
        }
        // Archive used to be tracked locally; push those notes into the server's own bucket and
        // only forget them once every one of them landed.
        const legacy = readLegacyArchived()
        if (legacy.length > 0) {
          let migrated = true
          for (const name of legacy) {
            const result = await memos.updateMemo(name, { state: 'ARCHIVED' })
            if (!result.success) {
              migrated = false
              console.warn('[memotrail] could not migrate archived note', name, result.error)
            }
          }
          if (migrated) clearLegacyArchived()
        }
      })
    }

    createTray({
      open: () => showMainWindow(),
      quickCapture: () => showQuickWindow(),
      quit: () => app.quit()
    })

    // A shortcut saved by an older build (or a keyboard layout) may no longer be registerable —
    // fall back to the default instead of leaving the app without a global shortcut.
    if (!registerQuickHotkey(config.quickHotkey)) {
      console.warn(`[memotrail] the shortcut ${config.quickHotkey} is taken or invalid`)
      if (config.quickHotkey !== DEFAULT_QUICK_HOTKEY && registerQuickHotkey(DEFAULT_QUICK_HOTKEY)) {
        console.warn(`[memotrail] fell back to ${DEFAULT_QUICK_HOTKEY}`)
        saveConfig({ quickHotkey: DEFAULT_QUICK_HOTKEY })
      }
    }

    // 两个快捷键撞在一起时后注册的必然失败，这种情况直接跳过主窗口快捷键。
    if (config.mainHotkey === config.quickHotkey) {
      console.warn('[memotrail] the main window shortcut equals the quick-capture one, skipped')
    } else if (!registerMainHotkey(config.mainHotkey)) {
      console.warn(`[memotrail] the main window shortcut ${config.mainHotkey} is taken or invalid`)
      if (config.mainHotkey !== DEFAULT_MAIN_HOTKEY && registerMainHotkey(DEFAULT_MAIN_HOTKEY)) {
        console.warn(`[memotrail] fell back to ${DEFAULT_MAIN_HOTKEY}`)
        saveConfig({ mainHotkey: DEFAULT_MAIN_HOTKEY })
      }
    }

    app.on('activate', () => showMainWindow())
  })

  // 关闭窗口 = 隐藏到托盘时，要放行真正的退出，否则 app.quit() 会被 close 拦截。
  app.on('before-quit', () => allowWindowClose())

  app.on('will-quit', () => unregisterHotkeys())

  // 「隐藏到托盘」模式下窗口只是被 hide，不会走到这里；保留判断以防窗口被意外销毁后应用凭空退出。
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !loadConfig().closeToTray) app.quit()
  })
}
