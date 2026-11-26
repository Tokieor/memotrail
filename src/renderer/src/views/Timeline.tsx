import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, Memo, User } from '@shared/types'
import { Composer } from '../components/Composer'
import { MemoCard } from '../components/MemoCard'

interface Props {
  config: AppConfig
  user: User
  onSignOut: () => void
  onConfigChange: (config: AppConfig) => void
}

type Filter = 'all' | 'pinned'

export function Timeline({ config, user, onSignOut, onConfigChange }: Props): JSX.Element {
  const [memos, setMemos] = useState<Memo[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true)
      setError('')
      const result = await window.api.memos.list({
        pageSize: 50,
        filter: filter === 'pinned' ? 'pinned' : undefined,
        pageToken: reset ? undefined : nextPageToken
      })
      if (result.success && result.data) {
        setMemos((current) => (reset ? result.data!.memos ?? [] : [...current, ...(result.data!.memos ?? [])]))
        setNextPageToken(result.data.nextPageToken)
      } else {
        setError(result.error ?? '加载失败')
      }
      setLoading(false)
    },
    [filter, nextPageToken]
  )

  useEffect(() => {
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">MemoTrail</h1>
          <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
            {user.displayName || user.username} · {config.serverUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => void load(true)} className="rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
            刷新
          </button>
          <button onClick={() => setSettingsOpen((v) => !v)} className="rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
            设置
          </button>
        </div>
      </header>

      {settingsOpen && (
        <SettingsPanel config={config} onConfigChange={onConfigChange} onSignOut={onSignOut} />
      )}

      <Composer
        onCreated={(memo) => {
          setMemos((current) => [memo, ...current])
        }}
      />

      <div className="flex gap-1 text-sm">
        {(['all', 'pinned'] as Filter[]).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className="rounded-lg px-3 py-1"
            style={{
              background: filter === value ? 'var(--accent)' : 'transparent',
              color: filter === value ? '#fff' : 'var(--text-soft)'
            }}
          >
            {value === 'all' ? '全部' : '置顶'}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-8">
        {error && <p className="text-sm" style={{ color: '#d33' }}>{error}</p>}
        {!error && !loading && memos.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            还没有记录，写第一条吧。
          </p>
        )}
        {memos.map((memo) => (
          <MemoCard key={memo.name} memo={memo} />
        ))}
        {nextPageToken && (
          <button
            onClick={() => void load(false)}
            disabled={loading}
            className="w-full rounded-lg border py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            {loading ? '加载中…' : '加载更多'}
          </button>
        )}
      </div>
    </div>
  )
}

interface SettingsProps {
  config: AppConfig
  onConfigChange: (config: AppConfig) => void
  onSignOut: () => void
}

function SettingsPanel({ config, onConfigChange, onSignOut }: SettingsProps): JSX.Element {
  const [hotkey, setHotkey] = useState(config.quickHotkey)
  const [launchAtLogin, setLaunchAtLogin] = useState(config.launchAtLogin)

  async function save(): Promise<void> {
    const next = await window.api.config.set({ quickHotkey: hotkey, launchAtLogin })
    onConfigChange(next)
  }

  return (
    <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
      <label className="mb-1 block text-xs" style={{ color: 'var(--text-soft)' }}>
        快速记录快捷键（Electron accelerator，如 CommandOrControl+Shift+M）
      </label>
      <input
        className="mb-3 w-full rounded-lg border px-3 py-1.5 outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
        value={hotkey}
        onChange={(e) => setHotkey(e.target.value)}
      />
      <label className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
        登录时启动
      </label>
      <div className="flex gap-2">
        <button onClick={() => void save()} className="rounded-lg px-3 py-1.5 text-white" style={{ background: 'var(--accent)' }}>
          保存
        </button>
        <button onClick={onSignOut} className="rounded-lg border px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
          退出登录
        </button>
      </div>
    </div>
  )
}
