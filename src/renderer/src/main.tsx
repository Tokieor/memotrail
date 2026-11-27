import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyCachedTheme } from './lib/theme'
import { applyCachedFontSize } from './lib/font-size'
import { App } from './App'
import './styles.css'

// Windows/Linux use a native title bar; only macOS needs the traffic-light inset.
if (window.api.platform !== 'darwin') document.documentElement.dataset.platform = window.api.platform

applyCachedTheme()
applyCachedFontSize()

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
