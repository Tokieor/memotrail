import type { Appearance, ThemeId } from '@shared/types'

const CACHE_KEY = 'memotrail.theme'

export interface ThemeChoice {
  theme: ThemeId
  appearance: Appearance
}

/** `system` resolves against the OS preference; everything else is explicit. */
export function resolveAppearance(appearance: Appearance): 'light' | 'dark' {
  if (appearance !== 'system') return appearance
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies the palette to <html> via data attributes and remembers it for the next boot. */
export function applyTheme(theme: ThemeId, appearance: Appearance): void {
  const root = document.documentElement
  const resolved = resolveAppearance(appearance)
  root.dataset.theme = theme
  root.dataset.appearance = resolved
  root.style.colorScheme = resolved
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ theme, appearance }))
  } catch {
    /* private mode or quota — the visual state still applies */
  }
}

/** Applies the last known palette synchronously, so a dark-mode window never flashes white. */
export function applyCachedTheme(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<ThemeChoice>
    applyTheme(parsed.theme === 'minimal' ? 'minimal' : 'classic', parsed.appearance ?? 'light')
  } catch {
    /* ignore malformed cache */
  }
}

/** Re-applies the palette when the OS flips between light and dark while `system` is selected. */
export function watchSystemAppearance(theme: ThemeId, appearance: Appearance): () => void {
  if (appearance !== 'system') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = (): void => applyTheme(theme, 'system')
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
