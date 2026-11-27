import { globalShortcut } from 'electron'
import { showQuickWindow, toggleMainWindow } from './windows'

let quickCurrent: string | null = null
let mainCurrent: string | null = null
let suspended = false

/**
 * 注册一个全局快捷键，替换掉同类里上一个。
 *
 * 返回 false 表示系统拒绝了它。`globalShortcut.register` 对不合法的 accelerator（例如键盘录制
 * 得到的非 ASCII `Alt+Shift+ˆ`）会直接抛错，所以这里包一层：一个坏的已存快捷键不能把启动流程带走。
 */
function register(accelerator: string, action: () => void, previous: string | null): { ok: boolean; current: string | null } {
  if (previous) globalShortcut.unregister(previous)
  if (!accelerator) return { ok: false, current: null }
  try {
    const ok = globalShortcut.register(accelerator, action)
    return { ok, current: ok ? accelerator : null }
  } catch {
    return { ok: false, current: null }
  }
}

/** 快速记录窗口的快捷键。 */
export function registerQuickHotkey(accelerator: string): boolean {
  const result = register(accelerator, () => showQuickWindow(), quickCurrent)
  quickCurrent = result.current
  return result.ok
}

/** 打开 / 隐藏主窗口的快捷键。 */
export function registerMainHotkey(accelerator: string): boolean {
  const result = register(accelerator, () => toggleMainWindow(), mainCurrent)
  mainCurrent = result.current
  return result.ok
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  quickCurrent = null
  mainCurrent = null
  suspended = false
}

/**
 * 录制期间临时挂起自家的全局快捷键。
 *
 * 系统的 RegisterHotKey 会先把按键吞掉，再交给前台窗口 —— 不挂起的话，用户在设置里想录
 * 「另一个功能当前占用的组合」时按下去只会弹窗，根本收不到 keydown，也就没法提示「已被占用」。
 * 只是注销、不清空记录，`resumeHotkeys` 能原样恢复。
 */
export function suspendHotkeys(): void {
  if (suspended) return
  suspended = true
  if (quickCurrent) globalShortcut.unregister(quickCurrent)
  if (mainCurrent) globalShortcut.unregister(mainCurrent)
}

export function resumeHotkeys(): void {
  if (!suspended) return
  suspended = false
  const quick = quickCurrent
  const main = mainCurrent
  quickCurrent = null
  mainCurrent = null
  if (quick) registerQuickHotkey(quick)
  if (main) registerMainHotkey(main)
}

export type HotkeySlot = 'quick' | 'main'
export type ProbeResult = 'ok' | 'taken' | 'invalid' | 'duplicate'

/**
 * 把 accelerator 归一成可比较的形式：`CommandOrControl` 在 macOS 是 ⌘、其它平台是 Ctrl，
 * `Cmd` 同 `Command`，`Option` 同 `Alt`，顺序无关。这样 `CommandOrControl+Shift+M` 与录到的
 * `Control+Shift+M` 会被认成同一个组合，而不会误报「被占用」。
 */
function canonical(accelerator: string): string {
  const mac = process.platform === 'darwin'
  return accelerator
    .split('+')
    .map((part) => {
      const key = part.trim().toLowerCase()
      if (key === 'commandorcontrol' || key === 'cmdorctrl') return mac ? 'command' : 'control'
      if (key === 'cmd' || key === 'command') return mac ? 'command' : 'super'
      if (key === 'ctrl') return 'control'
      if (key === 'option') return 'alt'
      return key
    })
    .sort()
    .join('+')
}

export function sameAccelerator(a: string, b: string): boolean {
  return canonical(a) === canonical(b)
}

/**
 * 录用前先试一下这个组合键能不能用：注册成功后立刻注销，不影响现有的快捷键。
 *
 * - 和自己当前占用的相同 → 可用（不需要重新注册）
 * - 和另一个功能当前占用的相同 → duplicate
 * - 系统拒绝（被别的应用占了）→ taken
 * - 格式不合法（Electron 直接抛错）→ invalid
 */
export function probeAccelerator(accelerator: string, slot: HotkeySlot): ProbeResult {
  if (!accelerator) return 'invalid'
  const mine = slot === 'quick' ? quickCurrent : mainCurrent
  const other = slot === 'quick' ? mainCurrent : quickCurrent
  if (mine && sameAccelerator(accelerator, mine)) return 'ok'
  if (other && sameAccelerator(accelerator, other)) return 'duplicate'
  try {
    if (!globalShortcut.register(accelerator, () => {})) return 'taken'
    globalShortcut.unregister(accelerator)
    return 'ok'
  } catch {
    return 'invalid'
  }
}
