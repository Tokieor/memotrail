import { app } from 'electron'
import { loadConfig } from './config'
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

  void app.whenReady().then(async () => {
    const config = loadConfig()
    if (config.serverUrl) {
      memos.setBaseUrl(config.serverUrl)
      // The refresh token is an HttpOnly cookie kept by the persistent session, so a restart can
      // restore the session without asking for the password again.
      const restored = await memos.refresh()
      if (!restored.success) console.warn('[memotrail] no stored session:', restored.error)
    }

    handleFileProtocol()
    registerIpc()
    createMainWindow()

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
