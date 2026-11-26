import { useState } from 'react'
import type { AppConfig, Appearance, SidebarCard, ThemeId } from '@shared/types'
import { describeError } from '../lib/errors'
import { formatAccelerator } from '../lib/accelerator'
import { applyTheme } from '../lib/theme'
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
  { id: 'minimal', label: '简约', hint: '纯黑白灰，不用彩色强调' }
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

/** Turns a keydown into an Electron accelerator, ignoring bare modifiers. */
export function toAccelerator(event: KeyboardEvent): string | null {
  const key = event.key
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null
  const parts: string[] = []
  if (event.metaKey) parts.push('Command')
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null
  const named: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' }
  parts.push(named[key] ?? (key.length === 1 ? key.toUpperCase() : key))
  return parts.join('+')
}

export function SettingsPanel({ config, memoCount, onConfigChange, onSignOut, onSynced }: Props): JSX.Element {
  const [section, setSection] = useState<SettingsSection>('connection')
  const [hotkey, setHotkey] = useState(config.quickHotkey)
  const [launchAtLogin, setLaunchAtLogin] = useState(config.launchAtLogin)
  const [showToken, setShowToken] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [wifiOnly, setWifiOnly] = useState(false)
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)

  async function save(): Promise<void> {
    try {
      const next = await window.api.config.set({ quickHotkey: hotkey, launchAtLogin })
      onConfigChange(next)
      setMessage('已保存')
    } catch (err) {
      setMessage(describeError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }
  }

  async function chooseLook(patch: { theme?: ThemeId; appearance?: Appearance; sidebarCard?: SidebarCard }): Promise<void> {
    try {
      const next = await window.api.config.set(patch)
      onConfigChange(next)
      applyTheme(next.theme, next.appearance)
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
          {section === 'connection' ? '管理 Memos 服务连接与本地同步行为' : '调整客户端偏好设置'}
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
                <div className="field-input"><span>{config.serverUrl || '未设置'}</span></div>
              </div>
              <div className="field-group">
                <label className="field-label">账号</label>
                <div className="field-input"><span>{config.username || '—'}</span></div>
              </div>
              <div className="field-group">
                <label className="field-label">访问令牌</label>
                <div className="field-input">
                  <span style={{ letterSpacing: 2, flex: 1 }}>{showToken ? '已登录（令牌由主进程安全保管）' : '••••••••••••••••••••'}</span>
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
            <div className="field-group">
              <label className="field-label">快速记录（点一下输入框后直接按组合键）</label>
              <input
                className="field-input"
                value={formatAccelerator(hotkey)}
                readOnly
                onKeyDown={(e) => {
                  e.preventDefault()
                  const accelerator = toAccelerator(e.nativeEvent)
                  if (accelerator) setHotkey(accelerator)
                }}
                placeholder="按下组合键…"
              />
            </div>
            <label className="pref-row" style={{ cursor: 'pointer' }}>
              <div className="pref-meta">
                <span className="pref-title">登录时启动</span>
                <span className="pref-sub">开机后自动在后台运行</span>
              </div>
              <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
            </label>
            {message && <p style={{ fontSize: 12, color: message === '已保存' ? 'var(--accent)' : 'var(--danger)', marginTop: 8 }}>{message}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="primary-btn" onClick={() => void save()}>保存</button>
              <button className="secondary-btn" onClick={onSignOut}>退出登录</button>
            </div>
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
              <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 12 }}>更改后记得在「快捷键」页保存。</p>
          </div>
        )}

        {section === 'appearance' && (
          <>
            <div className="settings-card">
              <h3 className="settings-card-title">配色主题</h3>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">{THEME_OPTIONS.find((option) => option.id === config.theme)?.label ?? '经典'}</span>
                  <span className="pref-sub">{THEME_OPTIONS.find((option) => option.id === config.theme)?.hint}</span>
                </div>
                <div className="segmented">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={config.theme === option.id ? 'active' : ''}
                      onClick={() => void chooseLook({ theme: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h3 className="settings-card-title">明暗模式</h3>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">{APPEARANCE_OPTIONS.find((option) => option.id === config.appearance)?.label}</span>
                  <span className="pref-sub">跟随系统时，macOS 切换外观会自动同步</span>
                </div>
                <div className="segmented">
                  {APPEARANCE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={config.appearance === option.id ? 'active' : ''}
                      onClick={() => void chooseLook({ appearance: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h3 className="settings-card-title">侧栏卡片</h3>
              <div className="pref-row">
                <div className="pref-meta">
                  <span className="pref-title">{config.sidebarCard === 'calendar' ? '日历' : '热力图'}</span>
                  <span className="pref-sub">侧边栏顶部展示写作日历，或最近十二周的热力图</span>
                </div>
                <div className="segmented">
                  {SIDEBAR_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={config.sidebarCard === option.id ? 'active' : ''}
                      onClick={() => void chooseLook({ sidebarCard: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
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
