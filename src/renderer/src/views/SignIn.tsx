import { useState } from 'react'
import type { AppConfig, User } from '@shared/types'
import { describeError } from '../lib/errors'
import { LogoMark } from '../components/Icons'

interface Props {
  config: AppConfig
  onSignedIn: (user: User, config: AppConfig) => void
}

export function SignIn({ config, onSignedIn }: Props): JSX.Element {
  const [serverUrl, setServerUrl] = useState(config.serverUrl)
  const [username, setUsername] = useState(config.username)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const result = await window.api.auth.signIn(serverUrl.trim(), username.trim(), password)
    if (result.success && result.data) {
      const next = await window.api.config.get()
      onSignedIn(result.data, next)
    } else {
      setError(describeError(result.error ?? '登录失败'))
    }
    setBusy(false)
  }

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <div className="signin-brand">
          <LogoMark size={40} />
          <div>
            <h1>轻笺</h1>
            <p>MEMOS DESKTOP</p>
          </div>
        </div>
        <p className="signin-lead">连接你的 Memos 服务器，开始记录</p>

        <form onSubmit={submit}>
          <div className="field-group">
            <label className="field-label">服务器地址</label>
            <div className="field-input"><input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://memos.example.com" autoFocus /></div>
          </div>
          <div className="field-group">
            <label className="field-label">用户名</label>
            <div className="field-input"><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="你的账号" /></div>
          </div>
          <div className="field-group">
            <label className="field-label">密码</label>
            <div className="field-input"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          </div>

          {error && <p className="inline-error" style={{ marginBottom: 12 }}>{error}</p>}

          <button type="submit" className="primary-btn signin-submit" disabled={busy || !serverUrl || !username || !password}>
            {busy ? '连接中…' : '连接并登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
