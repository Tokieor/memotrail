import { useState } from 'react'
import type { AppConfig, AuthMode, MemosVersion, SignInResult, User } from '@shared/types'
import { describeError } from '../lib/errors'
import { ChevronIcon, EyeIcon, LogoMark } from '../components/Icons'

interface Props {
  config: AppConfig
  onSignedIn: (user: User, config: AppConfig) => void
}

/**
 * 客户端适配的 Memos 版本清单。登录时由用户确认，连接成功后再与服务器实际版本比对，
 * 对不上会先提示、由用户决定是否继续（API 形状不同，强行登录可能读不到笔记）。
 */
const VERSIONS: { id: MemosVersion; label: string }[] = [{ id: '0.31.0', label: 'Memos 0.31.0' }]

const AUTH_METHODS: { id: AuthMode; label: string; hint: string }[] = [
  { id: 'password', label: '账号密码', hint: '用账号密码登录，会话由应用自动续期' },
  { id: 'token', label: '访问令牌', hint: '用个人访问令牌登录，令牌长期有效、不会自动续期' }
]

export function SignIn({ config, onSignedIn }: Props): JSX.Element {
  const [mode, setMode] = useState<AuthMode>(config.authMode)
  const [serverUrl, setServerUrl] = useState(config.serverUrl)
  const [version, setVersion] = useState<MemosVersion>(config.memosVersion)
  const [username, setUsername] = useState(config.username)
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 版本不一致时的暂存结果：不直接进主界面，先让用户确认。 */
  const [mismatch, setMismatch] = useState<SignInResult | null>(null)

  const ready =
    serverUrl.trim().length > 0 && (mode === 'password' ? username.trim() && password : token.trim().length > 0)

  function switchMode(next: AuthMode): void {
    if (busy || next === mode) return
    setMode(next)
    setError('')
    setMismatch(null)
    // 记住这次选的登录方式，下次打开还停在这一页。
    void window.api.config.set({ authMode: next }).catch(() => undefined)
  }

  async function finish(result: SignInResult): Promise<void> {
    // 服务器版本与所选版本不一致时先停一下：接口形状可能不同，让用户自己决定要不要继续。
    if (result.serverVersion && result.serverVersion !== version) {
      setMismatch(result)
      setBusy(false)
      return
    }
    const next = await window.api.config.get()
    onSignedIn(result.user, next)
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError('')
    const result =
      mode === 'password'
        ? await window.api.auth.signIn(serverUrl.trim(), username.trim(), password, version)
        : await window.api.auth.signInWithToken(serverUrl.trim(), token.trim(), version)
    if (result.success) {
      await finish(result.data)
    } else {
      setError(describeError(result.error ?? '登录失败'))
      setBusy(false)
    }
  }

  async function proceedAnyway(): Promise<void> {
    if (!mismatch) return
    setBusy(true)
    const next = await window.api.config.get()
    onSignedIn(mismatch.user, next)
  }

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <div className="signin-brand">
          <LogoMark size={40} />
          <div>
            <h1>MemoTrail</h1>
            <p>MEMOS DESKTOP</p>
          </div>
        </div>
        <p className="signin-lead">连接你的 Memos 服务器，开始记录</p>

        <div className="auth-tabs" role="tablist" aria-label="登录方式">
          {AUTH_METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              role="tab"
              title={method.hint}
              aria-selected={mode === method.id}
              className={mode === method.id ? 'active' : ''}
              onClick={() => switchMode(method.id)}
              disabled={busy}
            >
              {method.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="field-group">
            <label className="field-label">服务器地址</label>
            <div className="field-input">
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://memos.example.com"
                autoFocus
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">服务器版本</label>
            <div className="field-input">
              <select
                className="field-select"
                value={version}
                onChange={(e) => setVersion(e.target.value as MemosVersion)}
                aria-label="服务器版本"
              >
                {VERSIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <ChevronIcon size={13} />
            </div>
            <p className="field-hint">目前仅适配 0.31.0，连接成功后会核对服务器的实际版本</p>
          </div>

          {mode === 'password' ? (
            <>
              <div className="field-group">
                <label className="field-label">用户名</label>
                <div className="field-input">
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="你的账号" />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">密码</label>
                <div className="field-input">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="field-group">
              <label className="field-label">访问令牌</label>
              <div className="field-input">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="memos_pat_…"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="meta-btn"
                  title={showToken ? '隐藏' : '显示'}
                  onClick={() => setShowToken((v) => !v)}
                >
                  <EyeIcon size={16} />
                </button>
              </div>
              <p className="field-hint">在 Memos 的「设置 → 访问令牌」中创建，令牌仅保存在本机</p>
            </div>
          )}

          {error && <p className="inline-error" style={{ marginBottom: 12 }}>{error}</p>}

          {mismatch ? (
            <div className="signin-warn">
              <p>
                服务器实际版本是 <strong>{mismatch.serverVersion}</strong>，与所选的 {version} 不一致。
                接口可能有差异，部分功能可能不可用。
              </p>
              <div className="signin-warn-actions">
                <button type="button" className="secondary-btn" onClick={() => setMismatch(null)}>
                  返回修改
                </button>
                <button type="button" className="primary-btn" onClick={() => void proceedAnyway()} disabled={busy}>
                  仍然登录
                </button>
              </div>
            </div>
          ) : (
            <button type="submit" className="primary-btn signin-submit" disabled={busy || !ready}>
              {busy ? '连接中…' : mode === 'password' ? '连接并登录' : '使用令牌登录'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
