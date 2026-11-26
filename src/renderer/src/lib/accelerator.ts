/**
 * 把 Electron accelerator（如 CommandOrControl+Shift+M）渲染成界面上的按键提示。
 * macOS 用符号拼接（⌘⇧M），其它平台用 + 连接（Ctrl+Shift+M）。
 */
const isMac = navigator.platform.toUpperCase().includes('MAC')

const SYMBOL: Record<string, string> = {
  commandorcontrol: isMac ? '⌘' : 'Ctrl',
  cmdorctrl: isMac ? '⌘' : 'Ctrl',
  command: isMac ? '⌘' : 'Win',
  cmd: isMac ? '⌘' : 'Win',
  super: isMac ? '⌘' : 'Win',
  meta: isMac ? '⌘' : 'Win',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  alt: isMac ? '⌥' : 'Alt',
  option: isMac ? '⌥' : 'Alt',
  shift: isMac ? '⇧' : 'Shift',
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  plus: '+'
}

export function formatAccelerator(accelerator: string | undefined | null): string {
  if (!accelerator) return ''
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const key = part.toLowerCase()
      if (SYMBOL[key]) return SYMBOL[key]
      if (part.length === 1) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
  return parts.join(isMac ? '' : '+')
}
