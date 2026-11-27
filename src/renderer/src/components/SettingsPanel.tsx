import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AppConfig, Appearance, SidebarCard, ThemeId } from '@shared/types'
import { describeError } from '../lib/errors'
import { captureAccelerator, formatAccelerator } from '../lib/accelerator'
import { applyTheme } from '../lib/theme'
import { applyFontSize, fontSizeFromConfig, FONT_SIZE_OPTIONS } from '../lib/font-size'
import { CheckIcon, ChevronIcon, EyeIcon, SyncIcon } from './Icons'

interface Props {
  config: AppConfig
  memoCount: number
  onConfigChange: (config: AppConfig) => void
  onSignOut: () => void
  onSynced?: () => void
}

type SettingsSection = 'connection' | 'general' | 'shortcut' | 'appearance' | 'about'

const THEME_OPTIONS: { id: ThemeId; label: string; hint: string }[] = [
  { id: 'classic', label: '经典', hint: '暖白纸感底色，鼠尾草绿强调色' },
  { id: 'minimal', label: '简约', hint: '纯黑白灰，不用彩色强调' },
  { id: 'checklist', label: '清单', hint: '白底细线、圆角字体、任务清单式排版' }
]

const SIDEBAR_OPTIONS: { id: SidebarCard; label: string }[] = [
  { id: 'heatmap', label: '热力图' },
  { id: 'calendar', label: '日历' }
]

const APPEARANCE_OPTIONS: { id: Appearance; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟随系统' }
]

const SECTIONS: { key: SettingsSection; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'connection', label: '连接与同步' },
  { key: 'shortcut', label: '快捷键' },
  { key: 'appearance', label: '外观' },
  { key: 'about', label: '关于' }
]

/**
 * 一条快捷键设置：只读输入框展示当前组合，右侧「录制」「保存」两个按钮。
 * 录制只负责把按键记下来并做可用性校验，真正注册要等点保存。
 */
interface HotkeyRowProps {
  label: string
  value: string
  error: string
  recording: boolean
  dirty: boolean
  onRecord: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  onCancel: () => void
  onSave: () => void
}

function HotkeyRow({ label, value, error, recording, dirty, onRecord, onKeyDown, onCancel, onSave }: HotkeyRowProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (recording) input.current?.focus()
  }, [recording])

  return (
    <div className="hotkey-field">
      <label className="field-label">{label}</label>
      <div className="hotkey-row">
        <input
          ref={input}
          className={`field-input${recording ? ' recording' : ''}`}
          value={recording ? '' : formatAccelerator(value)}
          placeholder={recording ? '请按下组合键…' : '未设置'}
          readOnly
          onKeyDown={onKeyDown}
          onBlur={onCancel}
        />
        <button type="button" className="secondary-btn" onClick={onRecord} disabled={recording}>录制</button>
        {/* 有报错（不合法 / 被占用）时不允许保存，避免写进一个注册不上的组合键。 */}
        <button type="button" className="primary-btn" onClick={onSave} disabled={!dirty || recording || !!error}>保存</button>
      </div>
      {error && <p className="hotkey-error">{error}</p>}
    </div>
  )
}

export function SettingsPanel({ config, memoCount, onConfigChange, onSignOut, onSynced }: Props): JSX.Element {
  const [section, setSection] = useState<SettingsSection>('connection')
  const [quickHotkey, setQuickHotkey] = useState(config.quickHotkey)
  const [mainHotkey, setMainHotkey] = useState(config.mainHotkey)
  const [quickError, setQuickError] = useState('')
  const [mainError, setMainError] = useState('')
  const [recording, setRecording] = useState<'quick' | 'main' | null>(null)
  const [notice, setNotice] = useState('')
  const [launchAtLogin, setLaunchAtLogin] = useState(config.launchAtLogin)
  const [closeToTray, setCloseToTray] = useState(config.closeToTray)
  const [showToken, setShowToken] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [wifiOnly, setWifiOnly] = useState(false)
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)

  const setErrorOf = (slot: 'quick' | 'main', text: string): void => {
    if (slot === 'quick') setQuickError(text)
    else setMainError(text)
  }

  // 面板被卸载（切页 / 关窗口）时确保快捷键已恢复。
  useEffect(() => () => { void window.api.hotkeys.resume() }, [])

  function startRecording(slot: 'quick' | 'main'): void {
    // 先挂起自家快捷键，否则按到「另一个功能当前占用的组合」会被系统吞掉、录不到。
    void window.api.hotkeys.suspend()
    setRecording(slot)
    setErrorOf(slot, '')
    setNotice('')
  }

  function cancelRecording(): void {
    setRecording(null)
    void window.api.hotkeys.resume()
  }

  /**
   * 录制结束：先把组合键摆到输入框里，再让主进程试注册一次，判断是否合法 / 被占用。
   * 校验不通过时保留按键、显示错误，保存按钮保持不可用。
   */
  async function captureFor(slot: 'quick' | 'main', accelerator: string): Promise<void> {
    setRecording(null)
    setNotice('')
    void window.api.hotkeys.resume()
    if (slot === 'quick') setQuickHotkey(accelerator)
    else setMainHotkey(accelerator)

    const result = await window.api.hotkeys.check(accelerator, slot)
    setErrorOf(
      slot,
      result === 'duplicate'
        ? '这个组合键已经用于另一个功能，请换一个'
        : result === 'taken'
          ? '这个组合键已被系统或其它应用占用，请换一个'
          : result === 'invalid'
            ? '系统不接受这个组合键，请换一个'
            : ''
    )
  }

  function handleRecordKey(slot: 'quick' | 'main', event: ReactKeyboardEvent<HTMLInputElement>): void {
    event.preventDefault()
    const native = event.nativeEvent
    if (native.key === 'Escape') {
      setRecording(null)
      setErrorOf(slot, '')
      void window.api.hotkeys.resume()
      return
    }
    const captured = captureAccelerator(native, window.api.platform)
    if (captured.error) {
      // 只按了字母这种不合法组合：报错但继续录制，用户可以接着按下一个组合。
      setErrorOf(slot, captured.error)
      return
    }
    if (captured.accelerator) void captureFor(slot, captured.accelerator)
  }

  /** 点「保存」才真正写配置并注册到系统。 */
  async function saveHotkey(slot: 'quick' | 'main'): Promise<void> {
    setNotice('')
    const value = slot === 'quick' ? quickHotkey : mainHotkey
    try {
      const next = await window.api.config.set(slot === 'quick' ? { quickHotkey: value } : { mainHotkey: value })
      onConfigChange(next)
      setErrorOf(slot, '')
      setNotice(slot === 'quick' ? '快速记录快捷键已生效' : '主窗口快捷键已生效')
    } catch (err) {
      setErrorOf(slot, describeError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }
  }

  async function toggleLaunchAtLogin(next: boolean): Promise<void> {
    setLaunchAtLogin(next)
    try {
      const updated = await window.api.config.set({ launchAtLogin: next })
      onConfigChange(updated)
    } catch (err) {
      setLaunchAtLogin(!next)
      setMessage(describeError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }
  }

  async function toggleCloseToTray(next: boolean): Promise<void> {
    setCloseToTray(next)
    try {
      const updated = await window.api.config.set({ closeToTray: next })
      onConfigChange(updated)
      setMessage('')
    } catch (err) {
      setCloseToTray(!next)
      setMessage(describeError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }
  }

  async function chooseLook(patch: { theme?: ThemeId; appearance?: Appearance; sidebarCard?: SidebarCard; fontSize?: number }): Promise<void> {
    try {
      const next = await window.api.config.set(patch)
      onConfigChange(next)
      applyTheme(next.theme, next.appearance)
      applyFontSize(fontSizeFromConfig(next))
      setMessage('')
    } catch (err) {
      setMessage(describeError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }
  }

  async function syncNow(): Promise<void> {
    setSyncing(true)
    setMessage('')
    const result = await window.api.memos.list({ pageSize: 1 })
    setSyncing(false)
    if (result.success) {
      onSynced?.()
      setMessage('已同步')
    } else {
      setMessage(result.error ?? '同步失败')
    }
  }

  return (
    <div className="settings-body">
      <nav className="settings-nav">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            className={`nav-item${section === item.key ? ' active' : ''}`}
            onClick={() => { setSection(item.key); setMessage('') }}
          >
            <span className="label">{item.label}</span>
            {item.key === 'connection' && <span className="status-dot" />}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        <h2 className="settings-section-title">{SECTIONS.find((s) => s.key === section)?.label}</h2>
        <p className="settings-section-sub">
          {section === 'connection'
            ? '管理 Memos 服务连接与本地同步行为'
            : section === 'shortcut'
              ? '点「录制」按下组合键，校验通过后点「保存」才会生效'
              : '调整客户端偏好设置'}
        </p>

        {section === 'connection' && (
          <>
            <div className="settings-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span className="settings-card-title" style={{ margin: 0 }}>Memos 服务</span>
                <span className="badge"><span className="status-dot" />连接成功</span>
              </div>

              <div className="field-group">
                <label className="field-label">服务器地址</label>
                <div className="field-input"><span className="field-text">{config.serverUrl || '未设置'}</span></div>
              </div>
              <div className="field-group">
                <label className="field-label">账号</label>
                <div className="field-input"><span className="field-text">{config.username || '—'}</span></div>
              </div>
              <div className="field-group">
                <label className="field-label">访问令牌</label>
                <div className="field-input">
                  <span className={`field-text${showToken ? '' : ' masked'}`}>
                    {showToken ? '已登录（令牌由主进程安全保管）' : '••••••••••••••••••••'}
                  </span>
                  <button className="meta-btn" onClick={() => setShowToken((v) => !v)} title={showToken ? '隐藏' : '显示'}>
                    <EyeIcon size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--faint)' }}>{memoCount} 条笔记 · 登录态自动恢复</span>
                <button className="secondary-btn" onClick={() => void syncNow()} disabled={syncing}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <SyncIcon size={13} />{syncing ? '同步中…' : '立即同步'}
                  </span>
                </button>
              </div>
            </div>

            <div className="settings-card">
              <h3 className="settings-card-title">同步设置</h3>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">自动同步</span>
                  <span className="pref-sub">笔记更改后自动上传至 Memos 服务</span>
                </div>
                <button className={`toggle ${autoSync ? 'on' : 'off'}`} onClick={() => setAutoSync((v) => !v)} aria-label="自动同步" />
              </div>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">同步间隔</span>
                  <span className="pref-sub">后台检查更新的频率</span>
                </div>
                <button className="select-btn">每 5 分钟 <ChevronIcon size={12} /></button>
              </div>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">仅在 Wi-Fi 下同步</span>
                  <span className="pref-sub">避免在移动网络下消耗流量</span>
                </div>
                <button className={`toggle ${wifiOnly ? 'on' : 'off'}`} onClick={() => setWifiOnly((v) => !v)} aria-label="仅 Wi-Fi" />
              </div>
            </div>

            {message && (
              <div className="toast" style={{ marginTop: 16 }}>
                {message === '已同步' || message === '已保存' ? <CheckIcon size={16} /> : null}
                {message}
              </div>
            )}
          </>
        )}

        {section === 'shortcut' && (
          <div className="settings-card">
            <h3 className="settings-card-title">全局快捷键</h3>
            <HotkeyRow
              label="打开 / 隐藏主窗口（窗口在前台时按下会收起）"
              value={mainHotkey}
              error={mainError}
              recording={recording === 'main'}
              dirty={mainHotkey !== config.mainHotkey}
              onRecord={() => startRecording('main')}
              onKeyDown={(e) => handleRecordKey('main', e)}
              onCancel={cancelRecording}
              onSave={() => void saveHotkey('main')}
            />
            <HotkeyRow
              label="快速记录（点一下录制按钮后直接按组合键）"
              value={quickHotkey}
              error={quickError}
              recording={recording === 'quick'}
              dirty={quickHotkey !== config.quickHotkey}
              onRecord={() => startRecording('quick')}
              onKeyDown={(e) => handleRecordKey('quick', e)}
              onCancel={cancelRecording}
              onSave={() => void saveHotkey('quick')}
            />
            {notice && <p className="hotkey-ok">{notice}</p>}
          </div>
        )}

        {section === 'general' && (
          <div className="settings-card">
            <h3 className="settings-card-title">通用</h3>
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-title">登录时启动</span>
                <span className="pref-sub">开机后自动在后台运行</span>
              </div>
              <button
                className={`toggle ${launchAtLogin ? 'on' : 'off'}`}
                onClick={() => void toggleLaunchAtLogin(!launchAtLogin)}
                aria-label="登录时启动"
              />
            </div>
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-title">关闭窗口时隐藏到托盘</span>
                <span className="pref-sub">
                  {closeToTray ? '点关闭按钮后应用继续在托盘运行，用托盘或快捷键可再打开' : '点关闭按钮即退出应用'}
                </span>
              </div>
              <button
                className={`toggle ${closeToTray ? 'on' : 'off'}`}
                onClick={() => void toggleCloseToTray(!closeToTray)}
                aria-label="关闭窗口时隐藏到托盘"
              />
            </div>
            {message && section === 'general' && (
              <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{message}</p>
            )}
          </div>
        )}

        {section === 'appearance' && (
          <div className="settings-card">
            <h3 className="settings-card-title">外观</h3>
            <div className="pref-row compact">
              <span className="pref-title">配色主题</span>
              <div className="segmented">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.hint}
                    className={config.theme === option.id ? 'active' : ''}
                    onClick={() => void chooseLook({ theme: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-row compact">
              <span className="pref-title">字体大小</span>
              <div className="segmented">
                {FONT_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={config.fontSize === option.value ? 'active' : ''}
                    title={`正文字号 ${option.value}px`}
                    onClick={() => void chooseLook({ fontSize: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-row compact">
              <span className="pref-title">明暗模式</span>
              <div className="segmented">
                {APPEARANCE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.id === 'system' ? '跟随系统时，切换 macOS 外观会自动同步' : option.label}
                    className={config.appearance === option.id ? 'active' : ''}
                    onClick={() => void chooseLook({ appearance: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-row compact">
              <span className="pref-title">侧栏卡片</span>
              <div className="segmented">
                {SIDEBAR_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.id === 'calendar' ? '侧栏顶部展示写作日历，可点某天筛选' : '侧栏顶部展示最近十二周的写作热力图'}
                    className={config.sidebarCard === option.id ? 'active' : ''}
                    onClick={() => void chooseLook({ sidebarCard: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'about' && (
          <div className="settings-card">
            <h3 className="settings-card-title">关于 MemoTrail</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
              MemoTrail · Memos Desktop<br />
              一个简洁、轻量的 Memos 第三方桌面客户端。<br />
              版本 0.1.0 · Electron + React 18
            </p>
            <button className="secondary-btn" style={{ marginTop: 12 }} onClick={onSignOut}>退出登录</button>
          </div>
        )}
      </div>
    </div>
  )
}
