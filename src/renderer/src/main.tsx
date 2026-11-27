import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyCachedTheme } from './lib/theme'
import { applyCachedFontSize } from './lib/font-size'
import { App } from './App'
import { WindowControls } from './components/WindowControls'
import './styles.css'

// macOS 用系统红绿灯、Windows 用自绘标题区，只有非 darwin 需要打平台标记给 CSS 用。
if (window.api.platform !== 'darwin') document.documentElement.dataset.platform = window.api.platform

applyCachedTheme()
applyCachedFontSize()

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    {/* 自绘标题栏按钮固定在窗口右上角，登录页也要有（否则登不上就关不掉窗口）。 */}
    <WindowControls />
  </React.StrictMode>
)
