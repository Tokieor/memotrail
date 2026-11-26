import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppConfig, Memo, TagColorKey, User } from '@shared/types'
import { defaultTagColor, TAG_COLORS, TAG_SORT_OPTIONS, tagColorVar, type TagSort, type TagStat } from '../lib/tags'
import { ContributionHeatmap } from './ContributionHeatmap'
import { MiniCalendar } from './MiniCalendar'
import {
  ArchiveIcon,
  CalendarIcon,
  CheckIcon,
  LogoMark,
  MoreIcon,
  NotesIcon,
  PencilIcon,
  PinIcon,
  SettingsIcon,
  SortIcon,
  TrashIcon
} from './Icons'

export type NavKey = 'all' | 'today' | 'starred' | 'archive'
export type SyncState = 'synced' | 'syncing' | 'error'

interface Props {
  config: AppConfig
  user: User
  memos: Memo[]
  activeNav: NavKey
  activeTag: string | null
  tags: TagStat[]
  tagSort: TagSort
  counts: { all: number; today: number; starred: number }
  sync: { state: SyncState; label: string; detail: string }
  onNavigate: (key: NavKey) => void
  onSelectTag: (tag: string | null) => void
  onTagSortChange: (sort: TagSort) => void
  onRenameTag: (from: string, to: string, color?: TagColorKey) => Promise<void>
  onDeleteTag: (tag: string) => Promise<void>
  onToggleTagPin: (tag: string) => void
  activeDay?: string | null
  onSelectDay?: (day: string | null) => void
  onOpenSettings: () => void
}

export function Sidebar({
  config, user, memos, activeNav, activeTag, tags, tagSort, counts, sync,
  onNavigate, onSelectTag, onTagSortChange, onRenameTag, onDeleteTag, onToggleTagPin,
  onOpenSettings, activeDay = null, onSelectDay
}: Props): JSX.Element {
  const serverHost = config.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const initial = (user.displayName || user.username || '·').slice(0, 1).toUpperCase()

  const [sortOpen, setSortOpen] = useState(false)
  const [menuTag, setMenuTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ name: string; color: TagColorKey } | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const sortButton = useRef<HTMLButtonElement>(null)
  const moreButtons = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    // A tag that vanished (renamed/deleted elsewhere) must not keep its menu mounted.
    if (menuTag && !tags.some((tag) => tag.name === menuTag)) setMenuTag(null)
  }, [tags, menuTag])

  async function runOnTag(tag: string, action: () => Promise<void>): Promise<void> {
    setBusyTag(tag)
    try {
      await action()
    } finally {
      setBusyTag(null)
      setMenuTag(null)
    }
  }

  async function confirmDelete(tag: TagStat): Promise<void> {
    const ok = window.confirm(
      `删除标签「${tag.name}」？\n\n会从 ${tag.count} 条笔记中移除 #${tag.name}，笔记的其他内容保持不变。`
    )
    if (!ok) return
    await runOnTag(tag.name, () => onDeleteTag(tag.name))
  }

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <LogoMark size={34} />
        <span className="brand-name">MemoTrail</span>
      </div>

      {config.sidebarCard === 'calendar' ? (
        <MiniCalendar memos={memos} selectedDay={activeDay} onSelectDay={onSelectDay} />
      ) : (
        <ContributionHeatmap memos={memos} />
      )}

      <nav className="nav-list">
        <NavItem icon={<NotesIcon size={18} />} label="全部笔记" count={counts.all} active={activeNav === 'all' && !activeTag} onClick={() => onNavigate('all')} />
        <NavItem icon={<CalendarIcon size={18} />} label="今日" count={counts.today || undefined} active={activeNav === 'today' && !activeTag} onClick={() => onNavigate('today')} />
        <NavItem icon={<PinIcon size={18} />} label="置顶" count={counts.starred || undefined} active={activeNav === 'starred' && !activeTag} onClick={() => onNavigate('starred')} />
        <NavItem icon={<ArchiveIcon size={18} />} label="归档" active={activeNav === 'archive' && !activeTag} onClick={() => onNavigate('archive')} />
      </nav>

      <div className="section-label" style={{ marginTop: 12 }}>
        <span>标签</span>
        <button
          ref={sortButton}
          className={`section-action${sortOpen ? ' on' : ''}${tagSort !== 'all' ? ' filtered' : ''}`}
          title="标签排序"
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          onClick={() => { setSortOpen((open) => !open); setMenuTag(null) }}
        >
          <SortIcon size={16} />
        </button>
      </div>

      {sortOpen && (
        <Popover anchorEl={sortButton.current} width={168} align="right" onClose={() => setSortOpen(false)}>
          {TAG_SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              role="menuitemradio"
              aria-checked={tagSort === option.key}
              className={`menu-item${tagSort === option.key ? ' checked' : ''}`}
              onClick={() => { onTagSortChange(option.key); setSortOpen(false) }}
            >
              <span className="menu-item-text">
                <span>{option.label}</span>
                <span className="menu-item-hint">{option.hint}</span>
              </span>
              {tagSort === option.key && <CheckIcon size={14} />}
            </button>
          ))}
        </Popover>
      )}

      <div className="tag-list">
        {tags.length === 0 && (
          <div className="tag-empty">
            {tagSort === 'pinned' ? '还没有置顶标签' : '还没有标签'}
          </div>
        )}
        {tags.map((tag) => (
          <div
            key={tag.name}
            className={[
              'tag-item',
              activeTag === tag.name ? 'active' : '',
              menuTag === tag.name ? 'menu-open' : '',
              busyTag === tag.name ? 'busy' : ''
            ].filter(Boolean).join(' ')}
          >
            <button
              className="tag-main"
              onClick={() => onSelectTag(activeTag === tag.name ? null : tag.name)}
              title={tag.name}
            >
              <span
                className="tag-dot"
                style={{ background: tagColorVar(tag.color) ?? tagColorVar(defaultTagColor(tag.name)) }}
              />
              <span className="label">{tag.name}</span>
              {tag.pinned && <PinIcon size={11} className="tag-pin" />}
            </button>
            <span className="count">{tag.count}</span>
            <button
              ref={(node) => { moreButtons.current[tag.name] = node }}
              className="tag-more"
              title="标签操作"
              aria-label={`${tag.name} 的标签操作`}
              aria-haspopup="menu"
              aria-expanded={menuTag === tag.name}
              onClick={() => { setMenuTag(menuTag === tag.name ? null : tag.name); setSortOpen(false) }}
            >
              <MoreIcon size={14} />
            </button>
          </div>
        ))}
      </div>

      {menuTag && (() => {
        const tag = tags.find((item) => item.name === menuTag)
        if (!tag) return null
        return (
          <Popover anchorEl={moreButtons.current[menuTag] ?? null} width={150} align="right" onClose={() => setMenuTag(null)}>
            <button
              className="menu-item"
              onClick={() => { setMenuTag(null); setEditing({ name: tag.name, color: tag.color ?? 'tone-1' }) }}
            >
              <PencilIcon size={14} /><span>编辑标签</span>
            </button>
            <button
              className="menu-item"
              onClick={() => { onToggleTagPin(tag.name); setMenuTag(null) }}
            >
              <PinIcon size={14} filled={tag.pinned} />
              <span>{tag.pinned ? '取消置顶' : '置顶标签'}</span>
            </button>
            <button
              className="menu-item danger"
              onClick={() => { void confirmDelete(tag) }}
            >
              <TrashIcon size={14} /><span>删除标签</span>
            </button>
          </Popover>
        )
      })()}

      <div className="sidebar-spacer" />

      <div className="sync-card">
        <div className="sync-row">
          <span className={`status-dot${sync.state === 'error' ? ' error' : ''}${sync.state === 'syncing' ? ' syncing' : ''}`} />
          <span className={`sync-title${sync.state === 'error' ? ' error' : ''}`}>{sync.label}</span>
          <span className="sync-time">{sync.state === 'syncing' ? '···' : '刚刚'}</span>
        </div>
        <div className="sync-desc" title={`${serverHost} · ${counts.all} 条笔记`}>
          {sync.detail || `${serverHost} · ${counts.all} 条笔记`}
        </div>
      </div>

      <button className="user-footer" onClick={onOpenSettings} title="打开设置">
        <span className="avatar">{initial}</span>
        <span className="user-meta">
          <span className="user-name">{user.displayName || user.username}</span>
          <span className="user-server">{serverHost || '个人空间'}</span>
        </span>
        <span style={{ color: 'var(--faint)', lineHeight: 0 }}><SettingsIcon size={16} /></span>
      </button>

      {editing && (
        <TagEditor
          tag={editing}
          existing={tags.filter((tag) => tag.name !== editing.name).map((tag) => tag.name)}
          onCancel={() => setEditing(null)}
          onSave={async (name, color) => {
            const target = name.trim().replace(/^#/, '')
            if (!target) return
            setEditing(null)
            await runOnTag(editing.name, () => onRenameTag(editing.name, target, color))
          }}
        />
      )}
    </aside>
  )
}

/** Small floating panel anchored to a trigger; escapes the sidebar's scroll clipping. */
function Popover({
  anchorEl, onClose, width = 150, align = 'right', children
}: {
  anchorEl: HTMLElement | null
  onClose: () => void
  width?: number
  align?: 'left' | 'right'
  children: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const margin = 8
    const height = ref.current?.offsetHeight ?? 0
    let top = rect.bottom + 6
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - 6 - height)
    const rawLeft = align === 'right' ? rect.right - width : rect.left
    const left = Math.min(Math.max(margin, rawLeft), window.innerWidth - width - margin)
    setPos({ top, left })
  }, [anchorEl, width, align])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
      if (anchorEl?.contains(target)) return
      closeRef.current()
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeRef.current()
    }
    function dismiss(): void {
      closeRef.current()
    }
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [anchorEl])

  return (
    <div
      ref={ref}
      className="popover-menu"
      role="menu"
      style={{ width, ...(pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' as const }) }}
    >
      {children}
    </div>
  )
}

function TagEditor({
  tag, existing, onCancel, onSave
}: {
  tag: { name: string; color: TagColorKey }
  existing: string[]
  onCancel: () => void
  onSave: (name: string, color: TagColorKey) => Promise<void>
}): JSX.Element {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<TagColorKey>(tag.color)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = name.trim().replace(/^#/, '')
  const duplicate = trimmed !== tag.name && existing.includes(trimmed)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function submit(): Promise<void> {
    if (!trimmed || duplicate || saving) return
    setSaving(true)
    await onSave(trimmed, color)
    setSaving(false)
  }

  return (
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="tag-dialog" role="dialog" aria-modal="true" aria-label="编辑标签">
        <h2>编辑标签</h2>
        <p className="tag-dialog-hint">重命名会同步修改笔记正文里的 #{tag.name}，其他内容不变。</p>
        <label className="field">
          <span className="field-label">标签名称</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void submit() }
              if (event.key === 'Escape') onCancel()
            }}
            placeholder="标签名称"
          />
        </label>
        {duplicate && <p className="dialog-warning">已存在同名标签，换一个名称。</p>}
        <div className="field">
          <span className="field-label">标签颜色</span>
          <div className="color-row">
            {TAG_COLORS.map((option) => (
              <button
                key={option.key}
                className={`color-swatch${color === option.key ? ' selected' : ''}`}
                style={{ background: `var(--${option.key})` }}
                title={option.label}
                aria-label={option.label}
                aria-pressed={color === option.key}
                onClick={() => setColor(option.key)}
              />
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={onCancel}>取消</button>
          <button className="primary-btn" onClick={() => void submit()} disabled={!trimmed || duplicate || saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  icon, label, count, active, onClick
}: { icon: JSX.Element; label: string; count?: number; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      {icon}
      <span className="label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  )
}
