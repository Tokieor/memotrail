import type { AppConfig } from '@shared/types'

const CACHE_KEY = 'memotrail.font-size'

/** 字号基准：CSS 里所有 px 字号都按这个值换算成 --font-scale。 */
export const BASE_FONT_SIZE = 14

export const FONT_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 12, label: '小' },
  { value: 14, label: '标准' },
  { value: 16, label: '大' },
  { value: 18, label: '特大' }
]

/** 渲染层统一入口：设置根变量并缓存，避免窗口重新打开时闪一下默认字号。 */
export function applyFontSize(size: number): void {
  const clamped = Math.min(20, Math.max(12, Math.round(size)))
  document.documentElement.style.setProperty('--font-scale', String(clamped / BASE_FONT_SIZE))
  try {
    localStorage.setItem(CACHE_KEY, String(clamped))
  } catch {
    /* 隐私模式或配额不足时，当前窗口的字号仍然生效 */
  }
}

/** 在 React 挂载前同步应用缓存的字号。 */
export function applyCachedFontSize(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) applyFontSize(Number(raw))
  } catch {
    /* 读取失败就用 CSS 里的默认 scale */
  }
}

/** 供配置加载后使用；无效值回落到标准字号。 */
export function fontSizeFromConfig(config: AppConfig): number {
  return typeof config.fontSize === 'number' && Number.isFinite(config.fontSize)
    ? Math.min(20, Math.max(12, Math.round(config.fontSize)))
    : BASE_FONT_SIZE
}
