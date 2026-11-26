import { app } from 'electron'
import { loadConfig, loadRefreshToken, saveRefreshToken, takeLegacyArchived } from './config'
import { registerQuickHotkey, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import * as memos from './memos/client'
import { handleFileProtocol, registerFileScheme } from './protocol'
import { createTray } from './tray'
import { createMainWindow, showMainWindow, showQuickWindow } from './windows'

registerFileScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
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
        // Archive used to be tracked locally; push those notes into the server's own bucket.
        for (const name of takeLegacyArchived()) {
          const result = await memos.updateMemo(name, { state: 'ARCHIVED' })
          if (!result.success) console.warn('[memotrail] could not migrate archived note', name, result.error)
        }
      })
    }

    createTray({
      open: () => showMainWindow(),
      quickCapture: () => showQuickWindow(),
      quit: () => app.quit()
    })

    if (!registerQuickHotkey(config.quickHotkey)) {
      console.warn(`[memotrail] the shortcut ${config.quickHotkey} is taken; change it in Settings`)
    }

    app.on('activate', () => showMainWindow())
  })

  app.on('will-quit', () => unregisterHotkeys())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
