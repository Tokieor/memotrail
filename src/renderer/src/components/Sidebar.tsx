import type { AppConfig, Memo, User } from '@shared/types'
import { ContributionHeatmap } from './ContributionHeatmap'
import { MiniCalendar } from './MiniCalendar'
import {
  ArchiveIcon,
  CalendarIcon,
  LogoMark,
  NotesIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon
} from './Icons'

export type NavKey = 'all' | 'today' | 'starred' | 'archive'
export type SyncState = 'synced' | 'syncing' | 'error'

const TAG_TONES = ['var(--tone-1)', 'var(--tone-2)', 'var(--tone-3)', 'var(--tone-4)']

interface Props {
  config: AppConfig
  user: User
  memos: Memo[]
  activeNav: NavKey
  activeTag: string | null
  tags: [string, number][]
  counts: { all: number; today: number; starred: number }
  sync: { state: SyncState; label: string; detail: string }
  onNewNote: () => void
  onNavigate: (key: NavKey) => void
  onSelectTag: (tag: string | null) => void
  activeDay?: string | null
  onSelectDay?: (day: string | null) => void
  onOpenSettings: () => void
}

export function Sidebar({
  config, user, memos, activeNav, activeTag, tags, counts, sync,
  onNewNote, onNavigate, onSelectTag, onOpenSettings, activeDay = null, onSelectDay
}: Props): JSX.Element {
  const serverHost = config.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const initial = (user.displayName || user.username || '·').slice(0, 1).toUpperCase()

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
        <NavItem icon={<StarIcon size={18} />} label="星标" count={counts.starred || undefined} active={activeNav === 'starred' && !activeTag} onClick={() => onNavigate('starred')} />
        <NavItem icon={<ArchiveIcon size={18} />} label="归档" active={activeNav === 'archive' && !activeTag} onClick={() => onNavigate('archive')} />
      </nav>

      <div className="section-label" style={{ marginTop: 12 }}>
        <span>标签</span>
        <button className="section-action" title="写一条带 #标签 的笔记（标签在正文里用 # 创建）" onClick={onNewNote}>
          <PlusIcon size={16} />
        </button>
      </div>
      <div className="tag-list">
        {tags.length === 0 && <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--faint)' }}>还没有标签</div>}
        {tags.map(([name, count], index) => (
          <button
            key={name}
            className={`tag-item${activeTag === name ? ' active' : ''}`}
            onClick={() => onSelectTag(activeTag === name ? null : name)}
          >
            <span className="tag-dot" style={{ background: TAG_TONES[index % TAG_TONES.length] }} />
            <span className="label">{name}</span>
            <span className="count">{count}</span>
          </button>
        ))}
      </div>

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
    </aside>
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
