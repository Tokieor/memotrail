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
  const image = nativeImage.createFromPath(resourcePath('trayTemplate.png'))
  // macOS draws template images black/white to match the menu bar.
  if (process.platform === 'darwin') image.setTemplateImage(true)

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
