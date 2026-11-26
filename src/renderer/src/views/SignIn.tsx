import { useState } from 'react'
import type { AppConfig, User } from '@shared/types'

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
      setError(result.error ?? '登录失败')
    }
    setBusy(false)
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold">MemoTrail</h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--text-soft)' }}>
          连接你的 Memos 服务器
        </p>

        <label className="mb-1 block text-xs" style={{ color: 'var(--text-soft)' }}>
          服务器地址
        </label>
        <input
          className="mb-4 w-full rounded-lg border px-3 py-2 outline-none focus:border-[var(--accent)]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://memos.example.com"
          autoFocus
        />

        <label className="mb-1 block text-xs" style={{ color: 'var(--text-soft)' }}>
          用户名
        </label>
        <input
          className="mb-4 w-full rounded-lg border px-3 py-2 outline-none focus:border-[var(--accent)]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="mb-1 block text-xs" style={{ color: 'var(--text-soft)' }}>
          密码
        </label>
        <input
          type="password"
          className="mb-4 w-full rounded-lg border px-3 py-2 outline-none focus:border-[var(--accent)]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="mb-3 text-xs" style={{ color: '#d33' }}>{error}</p>}

        <button
          type="submit"
          disabled={busy || !serverUrl || !username || !password}
          className="w-full rounded-lg px-3 py-2 font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {busy ? '连接中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
