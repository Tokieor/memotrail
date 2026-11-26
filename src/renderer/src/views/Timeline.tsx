import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, Memo, User } from '@shared/types'
import { Composer } from '../components/Composer'
import { MemoCard } from '../components/MemoCard'
import { SettingsPanel } from '../components/SettingsPanel'
import { Sidebar } from '../components/Sidebar'
import type { NavKey, SyncState } from '../components/Sidebar'
import { describeError } from '../lib/errors'
import {
  BackIcon,
  CardViewIcon,
  ListViewIcon,
  MoreIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon
} from '../components/Icons'

interface Props {
  config: AppConfig
  user: User
  onSignOut: () => void
  onConfigChange: (config: AppConfig) => void
}

type View = 'feed' | 'settings'

function todayStart(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function isToday(memo: Memo): boolean {
  if (!memo.createTime) return false
  return new Date(memo.createTime).getTime() >= todayStart()
}

/** Builds the CEL expression Memos 0.31.0 expects in `?filter=`. */
export function buildFilter(pinned: boolean, query: string, tag: string | null): string | undefined {
  const parts: string[] = []
  if (pinned) parts.push('pinned == true')
  if (query.trim()) parts.push(`content.contains(${JSON.stringify(query.trim())})`)
  if (tag) parts.push(`${JSON.stringify(tag)} in tags`)
  return parts.length > 0 ? parts.join(' && ') : undefined
}

export function Timeline({ config, user, onSignOut, onConfigChange }: Props): JSX.Element {
  const [memos, setMemos] = useState<Memo[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nav, setNav] = useState<NavKey>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [view, setView] = useState<View>('feed')
  const [listMode, setListMode] = useState<'card' | 'list'>('card')
  const [composerFocus, setComposerFocus] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>('synced')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true)
      setError('')
      setSyncState('syncing')
      const pinned = nav === 'starred'
      const effectiveTag = tag
      // Archive is not a server filter in the current API; handled client-side below.
      const result = await window.api.memos.list({
        pageSize: 50,
        filter: buildFilter(pinned, debouncedQuery, effectiveTag),
        pageToken: reset ? undefined : nextPageToken
      })
      if (result.success && result.data) {
        const page = result.data.memos ?? []
        setMemos((current) => (reset ? page : [...current, ...page]))
        setNextPageToken(result.data.nextPageToken || undefined)
        setSyncState('synced')
      } else {
        setError(describeError(result.error ?? '加载失败'))
        setSyncState('error')
      }
      setLoading(false)
    },
    [nav, debouncedQuery, tag, nextPageToken]
  )

  useEffect(() => {
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, debouncedQuery, tag])

  // Writes from the quick-capture window (and any other window) reload the timeline.
  useEffect(() => window.api.memos.onChange(() => void load(true)), [load])

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
        setView('feed')
        setEditing(null)
        setComposerFocus((tick) => tick + 1)
      } else if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setView('feed')
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

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const memo of memos) for (const name of memo.tags ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [memos])

  const visibleMemos = useMemo(() => {
    if (nav === 'today') return memos.filter(isToday)
    if (nav === 'archive') return []
    return memos
  }, [memos, nav])

  const counts = useMemo(() => ({
    all: memos.length,
    today: memos.filter(isToday).length,
    starred: memos.filter((m) => m.pinned).length
  }), [memos])

  function replace(memo: Memo): void {
    setMemos((current) => current.map((item) => (item.name === memo.name ? memo : item)))
  }

  function remove(name: string): void {
    setMemos((current) => current.filter((item) => item.name !== name))
  }

  function navigate(key: NavKey): void {
    setView('feed')
    setEditing(null)
    setTag(null)
    setNav(key)
  }

  function selectTag(next: string | null): void {
    setView('feed')
    setEditing(null)
    setNav('all')
    setTag(next)
  }

  const syncLabel = syncState === 'error' ? '同步失败' : syncState === 'syncing' ? '同步中' : '已同步'
  const serverHost = config.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  const viewTitle = tag ? `#${tag}` : nav === 'starred' ? '星标' : nav === 'today' ? '今日' : nav === 'archive' ? '归档' : '全部笔记'

  return (
    <div className="app-shell">
      <Sidebar
        config={config}
        user={user}
        memos={memos}
        activeNav={nav}
        activeTag={tag}
        tags={allTags}
        counts={counts}
        sync={{ state: syncState, label: syncLabel, detail: `${serverHost} · ${memos.length} 条笔记` }}
        onNewNote={() => { setView('feed'); setEditing(null); setComposerFocus((t) => t + 1) }}
        onNavigate={navigate}
        onSelectTag={selectTag}
        onOpenSettings={() => { setEditing(null); setView('settings') }}
      />

      <div className="main-area">
        {view === 'settings' ? (
          <>
            <header className="topbar">
              <button className="ghost-btn" onClick={() => setView('feed')} title="返回">
                <BackIcon size={20} />
              </button>
              <h1>设置</h1>
              <span className="spacer" />
              <span className="subtitle">所有更改自动保存</span>
            </header>
            <SettingsPanel
              config={config}
              memoCount={memos.length}
              onConfigChange={onConfigChange}
              onSignOut={onSignOut}
              onSynced={() => void load(true)}
            />
          </>
        ) : editing ? (
          <>
            <header className="topbar">
              <button className="ghost-btn" onClick={() => setEditing(null)} title="返回">
                <BackIcon size={20} />
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: 'var(--faint)' }}>全部笔记</span>
                <span style={{ color: 'var(--border)' }}>/</span>
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>笔记详情</span>
              </div>
              <span className="spacer" />
              <span className="save-state"><span className="status-dot" />已保存</span>
              <button
                className={`ghost-btn${editing.pinned ? '' : ''}`}
                title={editing.pinned ? '取消置顶' : '置顶'}
                onClick={() => void runPin(editing)}
              >
                <StarIcon size={18} filled={Boolean(editing.pinned)} />
              </button>
              <button className="ghost-btn" title="更多" onClick={() => setEditing(null)}>
                <MoreIcon size={18} />
              </button>
            </header>
            <div className="feed-scroll">
              <div className="editor-card">
                <div className="tag-row" style={{ marginBottom: 4 }}>
                  {(editing.tags ?? []).map((t) => (
                    <span key={t} className="tag-chip green"><span>{t}</span></span>
                  ))}
                </div>
                <Composer
                  key={editing.name}
                  memoName={editing.name}
                  initialContent={editing.content}
                  initialVisibility={editing.visibility}
                  variant="editor"
                  autoFocus
                  onSubmitted={(memo) => { replace(memo); setEditing(null) }}
                  onCancel={() => setEditing(null)}
                />
                <div className="editor-divider" />
                <div className="meta-row" style={{ marginTop: 0 }}>
                  <span>创建于 {editing.createTime ? new Date(editing.createTime).toLocaleString('zh-CN') : '—'}</span>
                  <span className="spacer" />
                  <span>{editing.content.length} 字</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="topbar">
              <div>
                <h1>{viewTitle}</h1>
                <p className="subtitle">共 {visibleMemos.length} 条 · 今天新增 {counts.today} 条</p>
              </div>
              <span className="spacer" />
              <label className="search-box">
                <SearchIcon size={14} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索笔记"
                />
                <span className="kbd">Ctrl/⌘+F</span>
              </label>
              <div className="view-switch">
                <button className={listMode === 'card' ? 'active' : ''} title="卡片视图" onClick={() => setListMode('card')}>
                  <CardViewIcon size={18} />
                </button>
                <button className={listMode === 'list' ? 'active' : ''} title="列表视图" onClick={() => setListMode('list')}>
                  <ListViewIcon size={18} />
                </button>
              </div>
              <button className="ghost-btn" onClick={() => setView('settings')} title="设置">
                <SettingsIcon size={18} />
              </button>
            </header>

            <div className="feed-scroll">
              <div className={`feed-inner${listMode === 'list' ? ' list-mode' : ''}`}>
                <Composer
                  focusSignal={composerFocus}
                  onSubmitted={(memo) => setMemos((current) => [memo, ...current])}
                />

                <div className="feed-section-label">最近</div>

                {error && <p className="inline-error" style={{ marginBottom: 12 }}>{error}</p>}
                {!error && !loading && visibleMemos.length === 0 && (
                  <div className="empty-state">
                    <p>{nav === 'archive' ? '暂无归档笔记' : (debouncedQuery || tag ? '没有匹配的记录。' : '还没有记录，写第一条吧。')}</p>
                  </div>
                )}

                {visibleMemos.map((memo) => (
                  <MemoCard
                    key={memo.name}
                    memo={memo}
                    serverUrl={config.serverUrl}
                    onChanged={replace}
                    onDeleted={remove}
                    onEdit={(m) => { setEditing(m); }}
                    onSelectTag={selectTag}
                  />
                ))}

                {nextPageToken && nav !== 'today' && nav !== 'archive' && (
                  <button
                    onClick={() => void load(false)}
                    disabled={loading}
                    className="secondary-btn"
                    style={{ width: '100%', marginTop: 16 }}
                  >
                    {loading ? '加载中…' : '加载更多'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )

  async function runPin(memo: Memo): Promise<void> {
    const result = await window.api.memos.update(memo.name, { pinned: !memo.pinned })
    if (result.success && result.data) setEditing(result.data)
  }
}
