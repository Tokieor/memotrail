import { app, Menu } from 'electron'
import { clearLegacyArchived, loadConfig, loadRefreshToken, readLegacyArchived, saveConfig, saveRefreshToken } from './config'
import { registerQuickHotkey, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import * as memos from './memos/client'
import { handleFileProtocol, registerFileScheme } from './protocol'
import { createTray } from './tray'
import { createMainWindow, showMainWindow, showQuickWindow } from './windows'

registerFileScheme()

const DEFAULT_QUICK_HOTKEY = 'CommandOrControl+Shift+M'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // 隐藏 Windows/Linux 上默认的 File/Edit/View/Window 菜单栏，界面由应用自身提供。
  Menu.setApplicationMenu(null)

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
    createMainWindow()

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

    app.on('activate', () => showMainWindow())
  })

  app.on('will-quit', () => unregisterHotkeys())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
