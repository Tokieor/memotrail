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
  enter: isMac ? '↩' : 'Enter',
  return: isMac ? '↩' : 'Enter',
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

/** 只按下修饰键时返回空对象，表示「还在录制中」。 */
export interface CaptureResult {
  accelerator?: string
  error?: string
}

const MODIFIER_KEYS = ['Meta', 'Control', 'Alt', 'Shift']

const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert'
}

/**
 * 把一次 keydown 转成 Electron accelerator。
 *
 * 平台差异：macOS 的主修饰键是 ⌘（accelerator 里写 `Command`），Windows / Linux 是 Ctrl（写
 * `Control`）；Win 键在 accelerator 里叫 `Super`，macOS 的 ⌥ 同样是 `Alt`。这些名字按操作系统解释，
 * 所以录制结果存字面量就行，展示时再由 `formatAccelerator` 按平台还原成 ⌘⇧M / Ctrl+Shift+M。
 */
export function captureAccelerator(event: KeyboardEvent, platform: string): CaptureResult {
  const mac = platform === 'darwin'
  const key = event.key

  // 修饰键本身不算主键，等用户按下真正的键。
  if (MODIFIER_KEYS.includes(key)) return {}

  // Electron 只认 ASCII 主键，中文输入法下的 `ˆ` 之类会让 register 直接抛错。
  if (key.length === 1 && key.charCodeAt(0) > 0x7e) {
    return { error: '这个按键不支持，请换一个' }
  }

  const parts: string[] = []
  if (event.metaKey) parts.push(mac ? 'Command' : 'Super')
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  const mainKey = NAMED_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key)

  // F1–F24 可以单独当全局快捷键；其它主键必须带修饰键，否则会抢走正常打字。
  const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(mainKey)
  if (parts.length === 0 && !isFunctionKey) {
    return { error: '需要至少一个修饰键（Ctrl / Alt / Shift / Win）' }
  }

  parts.push(mainKey)
  return { accelerator: parts.join('+') }
}
