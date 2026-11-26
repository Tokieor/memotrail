import { app, BrowserWindow } from 'electron'
import { loadConfig } from './config'
import { registerQuickHotkey, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import * as memos from './memos/client'
import { createTray } from './tray'
import { createMainWindow, showQuickWindow } from './windows'

let mainWindow: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    const config = loadConfig()
    if (config.serverUrl) memos.setBaseUrl(config.serverUrl)

    registerIpc()
    mainWindow = createMainWindow()

    createTray({
      open: () => {
        if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow()
        mainWindow.show()
        mainWindow.focus()
      },
      quickCapture: () => showQuickWindow(),
      quit: () => app.quit()
    })

    if (!registerQuickHotkey(config.quickHotkey)) {
      console.warn(`[memotrail] the shortcut ${config.quickHotkey} is taken; change it in Settings`)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
      else mainWindow?.show()
    })
  })

  app.on('will-quit', () => unregisterHotkeys())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
