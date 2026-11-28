import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'

function resourcePath(...parts: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', ...parts)
    : join(app.getAppPath(), 'resources', ...parts)
}

export interface TrayActions {
  open: () => void
  quickCapture: () => void
  quit: () => void
}

/** macOS 菜单栏图标的规范高度是 18pt，高清资源由同名 @2x 文件提供。 */
const MAC_TRAY_HEIGHT = 18

export function createTray(actions: TrayActions): Tray {
  const isMac = process.platform === 'darwin'
  // macOS 用模板图自动适配菜单栏明暗；Windows 用彩色图标，深色任务栏上也看得清。
  let image = nativeImage.createFromPath(resourcePath(isMac ? 'trayTemplate.png' : 'trayWindows.png'))
  if (isMac) {
    // 资源若被换回大图（或第三方替换），这里按高度压到标准，免得图标顶出菜单栏。
    const { width, height } = image.getSize()
    if (height > MAC_TRAY_HEIGHT) {
      image = image.resize({ width: Math.round((width * MAC_TRAY_HEIGHT) / height), height: MAC_TRAY_HEIGHT })
    }
    image.setTemplateImage(true)
  }

  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('MemoTrail')

  const menu = Menu.buildFromTemplate([
    { label: '打开 MemoTrail', click: actions.open },
    { label: '快速记录', click: actions.quickCapture },
    { type: 'separator' },
    { label: '退出', click: actions.quit }
  ])

  if (isMac) {
    // macOS 上一旦 setContextMenu，左键点击也会把菜单弹出来。改成右键（含 Control+点击）时手动弹，
    // 左键留给「打开主窗口」。
    tray.on('right-click', () => tray.popUpContextMenu(menu))
  } else {
    // Windows/Linux 的托盘菜单只有右键才触发，左键照样走 click 事件。
    tray.setContextMenu(menu)
  }

  tray.on('click', actions.open)
  return tray
}
