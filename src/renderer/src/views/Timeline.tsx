import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig, Memo, User } from '@shared/types'
import { Composer } from '../components/Composer'
import { MemoCard } from '../components/MemoCard'
import { describeError } from '../lib/errors'

interface Props {
  config: AppConfig
  user: User
  onSignOut: () => void
  onConfigChange: (config: AppConfig) => void
}

type Kind = 'all' | 'pinned'

/** Builds the CEL expression Memos 0.31.0 expects in `?filter=`. */
export function buildFilter(kind: Kind, query: string, tag: string | null): string | undefined {
  const parts: string[] = []
  if (kind === 'pinned') parts.push('pinned == true')
  if (query.trim()) parts.push(`content.contains(${JSON.stringify(query.trim())})`)
  if (tag) parts.push(`${JSON.stringify(tag)} in tags`)
  return parts.length > 0 ? parts.join(' && ') : undefined
}

export function Timeline({ config, user, onSignOut, onConfigChange }: Props): JSX.Element {
  const [memos, setMemos] = useState<Memo[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true)
      setError('')
      const result = await window.api.memos.list({
        pageSize: 50,
        filter: buildFilter(kind, debouncedQuery, tag),
        pageToken: reset ? undefined : nextPageToken
      })
      if (result.success && result.data) {
        const page = result.data.memos ?? []
        setMemos((current) => (reset ? page : [...current, ...page]))
        setNextPageToken(result.data.nextPageToken || undefined)
      } else {
        setError(describeError(result.error ?? '加载失败'))
      }
      setLoading(false)
    },
    [kind, debouncedQuery, tag, nextPageToken]
  )

  useEffect(() => {
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, debouncedQuery, tag])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const memo of memos) for (const name of memo.tags ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [memos])

  function replace(memo: Memo): void {
    setMemos((current) => current.map((item) => (item.name === memo.name ? memo : item)))
  }

  function remove(name: string): void {
    setMemos((current) => current.filter((item) => item.name !== name))
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-3 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">MemoTrail</h1>
          <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
            {user.displayName || user.username} · {config.serverUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => void load(true)} className="rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
            刷新
          </button>
          <button onClick={() => setSettingsOpen((v) => !v)} className="rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
            设置
          </button>
        </div>
      </header>

      {settingsOpen && <SettingsPanel config={config} onConfigChange={onConfigChange} onSignOut={onSignOut} />}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索内容…"
        className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
      />

      <div className="flex flex-wrap items-center gap-1 text-sm">
        {(['all', 'pinned'] as Kind[]).map((value) => (
          <Chip key={value} active={kind === value} onClick={() => setKind(value)}>
            {value === 'all' ? '全部' : '置顶'}
          </Chip>
        ))}
        {tag && (
          <Chip active onClick={() => setTag(null)}>
            #{tag} ✕
          </Chip>
        )}
        {!tag &&
          tags.map(([name, count]) => (
            <Chip key={name} active={false} onClick={() => setTag(name)}>
              #{name} <span style={{ opacity: 0.5 }}>{count}</span>
            </Chip>
          ))}
      </div>

      {editing ? (
        <Composer
          memoName={editing.name}
          initialContent={editing.content}
          initialVisibility={editing.visibility}
          autoFocus
          onSubmitted={(memo) => {
            replace(memo)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Composer
          onSubmitted={(memo) => {
            setMemos((current) => [memo, ...current])
          }}
        />
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-8">
        {error && (
          <p className="text-sm" style={{ color: '#d33' }}>
            {error}
          </p>
        )}
        {!error && !loading && memos.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {debouncedQuery || tag ? '没有匹配的记录。' : '还没有记录，写第一条吧。'}
          </p>
        )}
        {memos.map((memo) => (
          <MemoCard key={memo.name} memo={memo} onChanged={replace} onDeleted={remove} onEdit={setEditing} />
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-xs"
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-soft)',
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`
      }}
    >
      {children}
    </button>
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
