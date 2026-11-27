import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, Memo, MemoState, TagColorKey, TagMetaMap, User } from '@shared/types'
import { Composer } from '../components/Composer'
import { MemoCard } from '../components/MemoCard'
import { visibleLength } from '../lib/text'
import { SettingsPanel } from '../components/SettingsPanel'
import { Sidebar } from '../components/Sidebar'
import type { NavKey, SyncState } from '../components/Sidebar'
import { describeError } from '../lib/errors'
import { formatAccelerator } from '../lib/accelerator'
import {
  collectTagStats, renameTagToken, sortTags, stripTagToken,
  type TagSort, type TagStat
} from '../lib/tags'
import {
  ArrowUpIcon,
  BackIcon,
  CardViewIcon,
  ListViewIcon,
  MoreIcon,
  PinIcon,
  SearchIcon
} from '../components/Icons'

const TAG_SORT_KEY = 'memotrail.tagSort'

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
function dayRange(day: string): { start: string; end: string } {
  const [year, month, date] = day.split('-').map(Number)
  const start = new Date(year, month - 1, date)
  const end = new Date(year, month - 1, date + 1)
  const iso = (value: Date): string => value.toISOString().replace(/\.\d+Z$/, 'Z')
  return { start: iso(start), end: iso(end) }
}

/** Builds the CEL expression Memos 0.31.0 expects in `?filter=`. */
export function buildFilter(query: string, tag: string | null, day?: string | null): string | undefined {
  const parts: string[] = []
  if (query.trim()) parts.push(`content.contains(${JSON.stringify(query.trim())})`)
  if (tag) parts.push(`${JSON.stringify(tag)} in tags`)
  if (day) {
    const { start, end } = dayRange(day)
    parts.push(`created_ts >= timestamp("${start}") && created_ts < timestamp("${end}")`)
  }
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
  const [day, setDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [view, setView] = useState<View>('feed')
  const [listMode, setListMode] = useState<'card' | 'list'>('card')
  const [composerFocus, setComposerFocus] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>('synced')
  /** Name of the memo whose "more" menu is open — at most one at a time. */
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const [showToTop, setShowToTop] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Navigating, filtering or switching views discards the open menu so it can never reappear.
  useEffect(() => {
    setOpenMenu(null)
  }, [nav, debouncedQuery, tag, day, view, listMode, editing])

  const load = useCallback(
    async (reset: boolean, options?: { silent?: boolean }) => {
      setLoading(true)
      setError('')
      // Switching filters or picking up a background write must not make the sync card blink
      // through 同步中 / ··· — only an explicit refresh shows the spinner.
      if (!options?.silent) setSyncState('syncing')
      const effectiveTag = tag
      // 归档 is a server-side bucket: the same list endpoint, a different `state`.
      const result = await window.api.memos.list({
        pageSize: 50,
        filter: buildFilter(debouncedQuery, effectiveTag, day),
        state: nav === 'archive' ? 'ARCHIVED' : 'NORMAL',
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
    [nav, debouncedQuery, tag, day, nextPageToken]
  )

  useEffect(() => {
    void load(true, { silent: true })
    // A different filter starts at the top of a different list.
    feedRef.current?.scrollTo({ top: 0 })
    setShowToTop(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, debouncedQuery, tag, day])

  // Scroll fires far more often than the browser paints; keep the state update to one per frame.
  const scrollFrame = useRef(0)
  const scrollTopRef = useRef(0)
  function onFeedScroll(event: React.UIEvent<HTMLDivElement>): void {
    scrollTopRef.current = event.currentTarget.scrollTop
    if (scrollFrame.current !== 0) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = 0
      setShowToTop(scrollTopRef.current > 320)
    })
  }

  function scrollToTop(): void {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Writes from the quick-capture window (and any other window) reload the timeline.
  useEffect(() => window.api.memos.onChange(() => void load(true, { silent: true })), [load])

  // Refreshing when the window regains focus keeps quick-captured memos in view.
  useEffect(() => {
    const onFocus = (): void => void load(true, { silent: true })
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

  /**
   * The server owns the archive (`state === 'ARCHIVED'`). Filtering again on the client keeps the
   * feed clean on servers that ignore the `state` query and still return both buckets.
   */
  const liveMemos = useMemo(() => memos.filter((memo) => memo.state !== 'ARCHIVED'), [memos])
  const archivedMemos = useMemo(() => memos.filter((memo) => memo.state === 'ARCHIVED'), [memos])

  /**
   * The sidebar always describes the feed (heatmap, tag counts, badges), so it keeps the last
   * non-archive snapshot: inside 归档 the loaded list only holds archived notes.
   */
  const [feedMemos, setFeedMemos] = useState<Memo[]>([])
  useEffect(() => {
    if (nav !== 'archive') setFeedMemos(liveMemos)
  }, [liveMemos, nav])

  // 标签栏只在「未过滤」时重算：否则选中标签后列表被服务端过滤，计数和顺序都会跳动。
  // 归档笔记不算进标签计数，否则点进标签看到的条数会比侧栏少。
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  useEffect(() => {
    if (tag || debouncedQuery) return
    setTagStats(collectTagStats(feedMemos))
  }, [feedMemos, tag, debouncedQuery])

  const [tagMeta, setTagMeta] = useState<TagMetaMap>(config.tagMeta ?? {})
  useEffect(() => {
    setTagMeta(config.tagMeta ?? {})
  }, [config.tagMeta])

  const [tagSort, setTagSort] = useState<TagSort>(() => {
    const stored = localStorage.getItem(TAG_SORT_KEY)
    return stored === 'frequent' || stored === 'recent' || stored === 'pinned' ? stored : 'all'
  })

  const tags = useMemo(() => sortTags(tagStats, tagMeta, tagSort), [tagStats, tagMeta, tagSort])

  // Custom colours also apply to the `#tag` chips inside note bodies.
  const tagColors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [name, entry] of Object.entries(tagMeta)) {
      if (entry.color) map[name] = `var(--${entry.color})`
    }
    return map
  }, [tagMeta])

  function changeTagSort(next: TagSort): void {
    setTagSort(next)
    localStorage.setItem(TAG_SORT_KEY, next)
  }

  async function persistTagMeta(next: TagMetaMap): Promise<void> {
    setTagMeta(next)
    try {
      const saved = await window.api.config.set({ tagMeta: next })
      onConfigChange(saved)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  /**
   * Moves a note between 归档 and the feed. The bucket lives on the server (`state`), so the note
   * leaves this list once the write lands; the archive view fetches its own bucket.
   */
  async function setMemoState(memo: Memo, next: MemoState): Promise<void> {
    setError('')
    const result = await window.api.memos.update(memo.name, { state: next })
    if (!result.success) {
      setError(result.error ?? '更新归档状态失败')
      return
    }
    // The card stays only when it now belongs to the bucket this view is showing.
    if ((nav === 'archive') === (next === 'ARCHIVED')) {
      if (result.data) replace(result.data)
    } else {
      remove(memo.name)
    }
  }

  /**
   * Every note carrying the tag, across pages and both buckets — a rename/delete must reach
   * archived notes too, and must not stop at page one.
   */
  async function listMemosWithTag(name: string): Promise<Memo[]> {
    const collected: Memo[] = []
    for (const state of ['NORMAL', 'ARCHIVED'] as MemoState[]) {
      let pageToken: string | undefined
      for (let page = 0; page < 20; page += 1) {
        const result = await window.api.memos.list({
          pageSize: 100,
          filter: buildFilter('', name),
          state,
          pageToken
        })
        if (!result.success || !result.data) break
        collected.push(...(result.data.memos ?? []))
        pageToken = result.data.nextPageToken || undefined
        if (!pageToken) break
      }
    }
    return collected
  }

  /** Rewrites every note body; `to === null` removes the tag instead of renaming it. */
  async function rewriteTag(from: string, to: string | null): Promise<boolean> {
    const affected = await listMemosWithTag(from)
    for (const memo of affected) {
      const next = to === null ? stripTagToken(memo.content, from) : renameTagToken(memo.content, from, to)
      if (next === memo.content) continue
      const result = await window.api.memos.update(memo.name, { content: next })
      if (!result.success) {
        setError(result.error ?? '更新笔记失败')
        return false
      }
      if (result.data) replace(result.data)
    }
    return true
  }

  async function renameTag(from: string, to: string, color?: TagColorKey): Promise<void> {
    setError('')
    if (to !== from && !(await rewriteTag(from, to))) return
    const next: TagMetaMap = { ...tagMeta }
    const previous = next[from]
    delete next[from]
    const merged = { ...(next[to] ?? {}), ...(previous ?? {}), ...(color ? { color } : {}) }
    if (Object.keys(merged).length > 0) next[to] = merged
    await persistTagMeta(next)
    if (tag === from) setTag(to)
    if (to !== from) await load(true)
  }

  async function deleteTag(name: string): Promise<void> {
    setError('')
    if (!(await rewriteTag(name, null))) return
    const next: TagMetaMap = { ...tagMeta }
    delete next[name]
    await persistTagMeta(next)
    if (tag === name) setTag(null)
    await load(true)
  }

  function toggleTagPin(name: string): void {
    const current = tagMeta[name] ?? {}
    void persistTagMeta({ ...tagMeta, [name]: { ...current, pinned: !current.pinned } })
  }

  const visibleMemos = useMemo(() => {
    if (nav === 'archive') return archivedMemos
    return nav === 'today' ? liveMemos.filter(isToday) : liveMemos
  }, [nav, liveMemos, archivedMemos])

  /**
   * Pinned notes float above the rest of the feed. `filter` keeps the server's newest-first order
   * inside each group; the archive view is a bucket of its own and stays flat.
   */
  const ordered = useMemo(() => {
    if (nav === 'archive') return visibleMemos
    return [...visibleMemos.filter((memo) => memo.pinned), ...visibleMemos.filter((memo) => !memo.pinned)]
  }, [visibleMemos, nav])

  const pinnedMemos = useMemo(
    () => (nav === 'archive' ? [] : ordered.filter((memo) => memo.pinned)),
    [ordered, nav]
  )
  const restMemos = useMemo(() => ordered.filter((memo) => !memo.pinned), [ordered])

  const counts = useMemo(
    () => ({ all: feedMemos.length, today: feedMemos.filter(isToday).length }),
    [feedMemos]
  )

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
    setDay(null)
    setNav(key)
  }

  function selectTag(next: string | null): void {
    setView('feed')
    setEditing(null)
    setNav('all')
    setDay(null)
    setTag(next)
  }

  /** Clicking the same day again clears the filter. */
  function selectDay(next: string | null): void {
    setView('feed')
    setEditing(null)
    setTag(null)
    setNav('all')
    setDay((current) => (current === next ? null : next))
  }

  const syncLabel = syncState === 'error' ? '同步失败' : syncState === 'syncing' ? '同步中' : '已同步'
  const serverHost = config.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  const viewTitle = day
    ? `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`
    : tag ? `#${tag}` : nav === 'today' ? '今日' : nav === 'archive' ? '归档' : '全部笔记'

  function renderMemo(memo: Memo): JSX.Element {
    return (
      <MemoCard
        key={memo.name}
        memo={memo}
        serverUrl={config.serverUrl}
        tagColors={tagColors}
        menuOpen={openMenu === memo.name}
        onMenuOpenChange={(open) => setOpenMenu(open ? memo.name : null)}
        onChanged={replace}
        onDeleted={remove}
        onArchive={(next) => { void setMemoState(memo, next ? 'ARCHIVED' : 'NORMAL') }}
        onEdit={(m) => { setOpenMenu(null); setEditing(m) }}
        onSelectTag={selectTag}
      />
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        config={config}
        user={user}
        memos={feedMemos}
        activeNav={nav}
        activeTag={tag}
        tags={tags}
        tagSort={tagSort}
        counts={counts}
        sync={{ state: syncState, label: syncLabel, detail: `${serverHost} · ${counts.all} 条笔记` }}
        onNavigate={navigate}
        onSelectTag={selectTag}
        onTagSortChange={changeTagSort}
        onRenameTag={renameTag}
        onDeleteTag={deleteTag}
        onToggleTagPin={toggleTagPin}
        activeDay={day}
        onSelectDay={selectDay}
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
                className={`ghost-btn${editing.pinned ? ' on' : ''}`}
                title={editing.pinned ? '取消置顶' : '置顶'}
                aria-pressed={Boolean(editing.pinned)}
                onClick={() => void runPin(editing)}
              >
                <PinIcon size={18} filled={Boolean(editing.pinned)} />
              </button>
              <button className="ghost-btn" title="更多" onClick={() => setEditing(null)}>
                <MoreIcon size={18} />
              </button>
            </header>
            <div className="feed-scroll">
              <div className="editor-card">
                <Composer
                  key={editing.name}
                  memoName={editing.name}
                  initialContent={editing.content}
                  initialVisibility={editing.visibility}
                  variant="editor"
                  tagSuggestions={tagStats.map((stat) => stat.name)}
                  autoFocus
                  onSubmitted={(memo) => { replace(memo); setEditing(null) }}
                  onCancel={() => setEditing(null)}
                />
                <div className="editor-divider" />
                <div className="meta-row" style={{ marginTop: 0 }}>
                  <span>创建于 {editing.createTime ? new Date(editing.createTime).toLocaleString('zh-CN') : '—'}</span>
                  <span className="spacer" />
                  <span>{visibleLength(editing.content)} 字</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="topbar feed-topbar">
              <div>
                <h1>{viewTitle}</h1>
                <p className="subtitle">
                  {day
                    ? `共 ${visibleMemos.length} 条 · 再点一次日期可取消筛选`
                    : nav === 'archive'
                      ? `共 ${visibleMemos.length} 条 · 已归档的笔记不进「全部笔记」`
                      : `共 ${visibleMemos.length} 条${pinnedMemos.length > 0 ? ` · 置顶 ${pinnedMemos.length}` : ''} · 今天新增 ${counts.today} 条`}
                </p>
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
                <span className="kbd">{formatAccelerator('CommandOrControl+F')}</span>
              </label>
              <div className="view-switch" role="group" aria-label="视图切换">
                <button
                  className={listMode === 'card' ? 'active' : ''}
                  title="卡片视图"
                  aria-label="卡片视图"
                  aria-pressed={listMode === 'card'}
                  onClick={() => setListMode('card')}
                >
                  <CardViewIcon size={18} />
                </button>
                <button
                  className={listMode === 'list' ? 'active' : ''}
                  title="列表视图"
                  aria-label="列表视图"
                  aria-pressed={listMode === 'list'}
                  onClick={() => setListMode('list')}
                >
                  <ListViewIcon size={18} />
                </button>
              </div>
            </header>

            <div className="feed-scroll" ref={feedRef} onScroll={onFeedScroll}>
              <div className={`feed-inner${listMode === 'list' ? ' list-mode' : ''}`}>
                <h1 className="feed-title">{viewTitle}</h1>
                <Composer
                  focusSignal={composerFocus}
                  tagSuggestions={tagStats.map((stat) => stat.name)}
                  placeholder={nav === 'archive' ? '写点什么存进归档，写完就在这一栏里…' : undefined}
                  onSubmitted={(memo) => {
                    setMemos((current) => [memo, ...current])
                    // Writing from 归档 files the new note straight into the archive.
                    if (nav === 'archive') void setMemoState(memo, 'ARCHIVED')
                  }}
                />

                {/* With pins in play the two groups carry their own labels; otherwise keep «最近». */}
                {nav !== 'archive' && pinnedMemos.length === 0 && restMemos.length > 0 && (
                  <div className="feed-section-label">最近</div>
                )}

                {error && <p className="inline-error" style={{ marginBottom: 12 }}>{error}</p>}
                {!error && !loading && visibleMemos.length === 0 && (
                  <div className="empty-state">
                    <p>{nav === 'archive' ? '暂无归档笔记' : (debouncedQuery || tag ? '没有匹配的记录。' : '还没有记录，写第一条吧。')}</p>
                  </div>
                )}

                {pinnedMemos.length > 0 && (
                  <>
                    <div className="feed-section-label pinned-label">
                      <PinIcon size={11} filled />
                      <span>置顶</span>
                    </div>
                    {pinnedMemos.map(renderMemo)}
                  </>
                )}
                {/* No label between the groups — a hairline does the same job with less noise. */}
                {pinnedMemos.length > 0 && restMemos.length > 0 && (
                  <div className="feed-divider" role="separator" />
                )}
                {restMemos.map(renderMemo)}

                {/* 归档 lives on the same server list, so older archived notes need paging too. */}
                {nextPageToken && nav !== 'today' && (
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

            <button
              className={`to-top${showToTop ? ' show' : ''}`}
              onClick={scrollToTop}
              title="回到顶部"
              aria-label="回到顶部"
              tabIndex={showToTop ? 0 : -1}
            >
              <ArrowUpIcon size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  )

  async function runPin(memo: Memo): Promise<void> {
    const result = await window.api.memos.update(memo.name, { pinned: !memo.pinned })
    if (result.success && result.data) {
      setEditing(result.data)
      // Keep the feed in sync so the note moves in or out of the pinned group on return.
      replace(result.data)
    }
  }
}
