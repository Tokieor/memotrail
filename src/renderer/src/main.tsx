import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyCachedTheme } from './lib/theme'
import { App } from './App'
import './styles.css'

applyCachedTheme()

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
