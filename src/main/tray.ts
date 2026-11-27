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

export function createTray(actions: TrayActions): Tray {
  const isMac = process.platform === 'darwin'
  // macOS 用模板图自动适配菜单栏明暗；Windows 用彩色图标，深色任务栏上也看得清。
  const image = nativeImage.createFromPath(resourcePath(isMac ? 'trayTemplate.png' : 'trayWindows.png'))
  if (isMac) image.setTemplateImage(true)

  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('MemoTrail')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 MemoTrail', click: actions.open },
      { label: '快速记录', click: actions.quickCapture },
      { type: 'separator' },
      { label: '退出', click: actions.quit }
    ])
  )
  tray.on('click', actions.open)
  return tray
}
