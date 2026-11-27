import { useEffect, useState } from 'react'

/**
 * 三个图标共用一套几何：同一 viewBox、同一笔画宽度。
 * 之前最小化是 1px 横线、关闭是 1px 斜线，在本机 157.5% 缩放下横线被摊成半透明、
 * 斜线反而叠得更实，看着就是「最小化太细、X 两条线粗细不一」。
 * 现在统一 1.5 逻辑像素（约 2.4 物理像素），并关掉像素吸附（见 styles.css）。
 */
const ICON = { size: 10, sw: 1.5, stroke: 'currentColor' } as const

/**
 * 自绘标题栏的窗口按钮（Windows）。
 *
 * 系统绘制的窗口按钮没有悬浮反馈，也涂不出主题色，所以整条标题区都自己画：
 * 三个按钮 + 悬浮底色 + 中文气泡提示。关闭仍走窗口的 close 事件，
 * 因此「关闭时隐藏到托盘」、关闭前保存窗口尺寸这些逻辑照旧生效。
 */
export function WindowControls(): JSX.Element | null {
  const isWindows = window.api.platform === 'win32'
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isWindows) return
    void window.api.windowControls.isMaximized().then(setMaximized)
    // 双击标题区、Win+↑、系统手势都会改变最大化状态，图标得跟着换。
    return window.api.windowControls.onMaximizedChange(setMaximized)
  }, [isWindows])

  if (!isWindows) return null

  return (
    <div className="window-controls">
      <button
        type="button"
        className="wc-btn"
        data-tip="最小化"
        aria-label="最小化"
        onClick={() => void window.api.windowControls.minimize()}
      >
        <svg width={ICON.size} height={ICON.size} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={ICON.stroke} strokeWidth={ICON.sw}>
          <path d="M1 5h8" />
        </svg>
      </button>
      <button
        type="button"
        className="wc-btn"
        data-tip={maximized ? '向下还原' : '最大化'}
        aria-label={maximized ? '向下还原' : '最大化'}
        onClick={() => void window.api.windowControls.toggleMaximize()}
      >
        {maximized ? (
          <svg width={ICON.size} height={ICON.size} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={ICON.stroke} strokeWidth={ICON.sw}>
            <path d="M3.4 1H9v5.6" />
            <rect x="1" y="3.4" width="5.6" height="5.6" />
          </svg>
        ) : (
          <svg width={ICON.size} height={ICON.size} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={ICON.stroke} strokeWidth={ICON.sw}>
            <rect x="1" y="1" width="8" height="8" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="wc-btn wc-close"
        data-tip="关闭"
        aria-label="关闭"
        onClick={() => void window.api.windowControls.close()}
      >
        <svg width={ICON.size} height={ICON.size} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={ICON.stroke} strokeWidth={ICON.sw}>
          <path d="M1.4 1.4L8.6 8.6M8.6 1.4L1.4 8.6" />
        </svg>
      </button>
    </div>
  )
}
