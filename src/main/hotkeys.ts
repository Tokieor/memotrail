import { globalShortcut } from 'electron'
import { showQuickWindow } from './windows'

let current: string | null = null

/**
 * Registers the quick-capture accelerator, replacing the previous one.
 *
 * Returns false when the system refuses it. `globalShortcut.register` *throws* on a malformed
 * accelerator (for example the non-ASCII `Alt+Shift+ˆ` a keyboard recorder can produce), so the
 * call is wrapped: a bad saved shortcut must never take the whole startup path down with it.
 */
export function registerQuickHotkey(accelerator: string): boolean {
  if (current) {
    globalShortcut.unregister(current)
    current = null
  }
  if (!accelerator) return false
  try {
    const ok = globalShortcut.register(accelerator, () => showQuickWindow())
    if (ok) current = accelerator
    return ok
  } catch {
    return false
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  current = null
}
