import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [composerFocus, setComposerFocus] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

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

  // Refreshing when the window regains focus keeps quick-captured memos in view.
  useEffect(() => {
    const onFocus = (): void => void load(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setEditing(null)
        setComposerFocus((tick) => tick + 1)
      } else if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (meta && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void load(true)
      } else if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [load])

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
        ref={searchRef}
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
          focusSignal={composerFocus}
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
          <MemoCard
            key={memo.name}
            memo={memo}
            serverUrl={config.serverUrl}
            onChanged={replace}
            onDeleted={remove}
            onEdit={setEditing}
          />
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

interface SettingsProps {
  config: AppConfig
  onConfigChange: (config: AppConfig) => void
  onSignOut: () => void
}

function SettingsPanel({ config, onConfigChange, onSignOut }: SettingsProps): JSX.Element {
  const [hotkey, setHotkey] = useState(config.quickHotkey)
  const [launchAtLogin, setLaunchAtLogin] = useState(config.launchAtLogin)

  const [message, setMessage] = useState('')

  async function save(): Promise<void> {
    try {
      const next = await window.api.config.set({ quickHotkey: hotkey, launchAtLogin })
      onConfigChange(next)
      setMessage('已保存')
    } catch (err) {
      setMessage((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
      <label className="mb-1 block text-xs" style={{ color: 'var(--text-soft)' }}>
        快速记录快捷键（点一下输入框后直接按组合键）
      </label>
      <input
        className="mb-3 w-full rounded-lg border px-3 py-1.5 outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
        value={hotkey}
        readOnly
        onKeyDown={(e) => {
          e.preventDefault()
          const accelerator = toAccelerator(e.nativeEvent)
          if (accelerator) setHotkey(accelerator)
        }}
        placeholder="按下组合键…"
      />
      <label className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
        登录时启动
      </label>
      {message && (
        <p className="mb-2 text-xs" style={{ color: message === '已保存' ? 'var(--text-soft)' : '#d33' }}>
          {message}
        </p>
      )}
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
