import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { loadConfig, loadWindowState, saveWindowState } from './config'

const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

/** 与主进程托盘共用同一套资源路径规则，保证开发态任务栏也用新图标而非 Electron 默认。 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

/** 深色模式下启动瞬间不该闪一条白底，窗口底色跟着配置走（对应 CSS 的 --paper）。 */
function initialBackgroundColor(): string {
  const { appearance } = loadConfig()
  const dark = appearance === 'dark' || (appearance === 'system' && nativeTheme.shouldUseDarkColors)
  return dark ? '#191817' : '#f7f6f3'
}

let mainWindow: BrowserWindow | null = null

/**
 * 「关闭即隐藏」不能拦住真正的退出流程：app.quit() 会先触发窗口的 close 事件，
 * 若此时仍 preventDefault，应用就退不掉了。退出前把这个开关打开即可放行。
 */
let quitting = false

export function allowWindowClose(): void {
  quitting = true
}

/** Sends a message to every open window (main + quick capture). */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function createMainWindow(): BrowserWindow {
  const saved = loadWindowState()
  const isWindows = process.platform === 'win32'
  const win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    minWidth: 760,
    minHeight: 460,
    show: false,
    // macOS 用 hiddenInset 留出红绿灯；Windows 干脆去掉整个原生边框，标题区完全由界面自绘
    // ——系统绘制的按钮没有悬浮反馈，也涂不出主题色。Linux 保持系统标题栏。
    ...(isWindows ? { frame: false } : { titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default' }),
    icon: iconPath(),
    backgroundColor: initialBackgroundColor(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 自绘按钮要知道当前是不是最大化状态（双击标题区、Win+↑ 也会改变它）。
  const sendMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', win.isMaximized())
  }
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)

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
  win.on('close', (event) => {
    if (resizeTimer) clearTimeout(resizeTimer)
    persistSize()
    if (quitting) return
    // 隐藏到托盘：窗口保留在内存里，托盘 / 全局快捷键都能立刻把它叫回来。
    if (loadConfig().closeToTray) {
      event.preventDefault()
      win.hide()
    }
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

/**
 * 全局快捷键的「打开 / 隐藏」：窗口正在前台时收起，否则提到最前。
 * 未聚焦但可见时选择「提到最前」而不是隐藏 — 从别的应用按快捷键应当切回来，而不是消失。
 */
export function toggleMainWindow(): void {
  const win = getMainWindow()
  if (!win) {
    showMainWindow()
    return
  }
  if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
    win.hide()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
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
