import { globalShortcut } from 'electron'
import { showQuickWindow } from './windows'

let current: string | null = null

/** Registers the quick-capture accelerator, replacing the previous one. Returns false when the system refuses it. */
export function registerQuickHotkey(accelerator: string): boolean {
  if (current) {
    globalShortcut.unregister(current)
    current = null
  }
  if (!accelerator) return false
  const ok = globalShortcut.register(accelerator, () => showQuickWindow())
  if (ok) current = accelerator
  return ok
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  current = null
}
