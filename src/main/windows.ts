import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { loadWindowState, saveWindowState } from './config'

const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null

/** Sends a message to every open window (main + quick capture). */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function createMainWindow(): BrowserWindow {
  const saved = loadWindowState()
  const win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    minWidth: 760,
    minHeight: 460,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f7f6f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Remember the size the user left the window at (debounced, and again on close).
  let resizeTimer: NodeJS.Timeout | null = null
  const persistSize = (): void => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    const [width, height] = win.getSize()
    saveWindowState({ width, height })
  }
  win.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(persistSize, 400)
  })
  win.on('close', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    persistSize()
  })

  // Links open in the user's browser, never in an app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (RENDERER_URL) void win.loadURL(RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  mainWindow = win
  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** Brings the timeline window forward, recreating it if the user closed it (macOS dock behaviour). */
export function showMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) return createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

let quickWindow: BrowserWindow | null = null

/** The global-shortcut capture window: frameless, always on top, hides as soon as it loses focus. */
export function showQuickWindow(): BrowserWindow {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.show()
    quickWindow.focus()
    return quickWindow
  }

  quickWindow = new BrowserWindow({
    width: 604,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  quickWindow.on('blur', () => quickWindow?.hide())
  quickWindow.once('ready-to-show', () => {
    quickWindow?.show()
    quickWindow?.focus()
  })

  if (RENDERER_URL) void quickWindow.loadURL(`${RENDERER_URL}/quick.html`)
  else void quickWindow.loadFile(join(__dirname, '../renderer/quick.html'))

  return quickWindow
}

export function hideQuickWindow(): void {
  quickWindow?.hide()
}
