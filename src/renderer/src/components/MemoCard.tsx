import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Memo } from '@shared/types'
import { relativeTime, renderMarkdown } from '../lib/markdown'
import { MoreIcon } from './Icons'

interface Props {
  memo: Memo
  serverUrl: string
  /** Tag name → CSS colour, so a customised tag keeps its colour inside note bodies. */
  tagColors?: Record<string, string>
  /** Owned by the feed list so only one card's menu can be open at a time. */
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onChanged: (memo: Memo) => void
  onDeleted: (name: string) => void
  onArchive: (archived: boolean) => void
  onEdit: (memo: Memo) => void
  onSelectTag?: (tag: string) => void
}

interface CardMenuProps {
  anchor: React.RefObject<HTMLButtonElement>
  pinned: boolean
  archived: boolean
  onClose: () => void
  onEdit: () => void
  onPin: () => void
  onArchive: () => void
  onCopy: () => void
  onDelete: () => void
}

/**
 * `position: fixed` measured against the trigger keeps the menu out of the feed's scroll clip,
 * and the owning card carries a raised z-index (`.note-card.menu-open`) so it also paints above
 * the following cards instead of sliding under them.
 */
function CardMenu({ anchor, pinned, archived, onClose, onEdit, onPin, onArchive, onCopy, onDelete }: CardMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const menu = menuRef.current
    const button = anchor.current
    if (!menu || !button) return
    const a = button.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const gap = 6
    const margin = 8
    // Flip above the trigger when there is not enough room below (last rows of the feed).
    let top = a.bottom + gap
    if (top + m.height > window.innerHeight - margin) {
      top = Math.max(margin, a.top - gap - m.height)
    }
    const left = Math.min(Math.max(margin, a.right - m.width), window.innerWidth - m.width - margin)
    setPos({ top, left })
  }, [anchor])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      // The trigger toggles itself through onClick, otherwise close+click would fight each other.
      if (anchor.current?.contains(target)) return
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
    // Capture phase catches the feed's inner scroll container too.
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [anchor])

  return (
    <div
      ref={menuRef}
      className="card-menu card-menu-floating"
      role="menu"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      <button className="action-btn" role="menuitem" onClick={() => { onClose(); onEdit() }}>编辑</button>
      <button className="action-btn" role="menuitem" onClick={() => { onClose(); onPin() }}>
        {pinned ? '取消置顶' : '置顶'}
      </button>
      <button className="action-btn" role="menuitem" onClick={() => { onClose(); onArchive() }}>
        {archived ? '移出归档' : '归档'}
      </button>
      <button className="action-btn" role="menuitem" onClick={() => { onClose(); onCopy() }}>复制</button>
      <button className="action-btn danger" role="menuitem" onClick={() => { onClose(); onDelete() }}>删除</button>
    </div>
  )
}

const VISIBILITY_LABEL: Record<string, string> = { PRIVATE: '私密', PROTECTED: '受保护', PUBLIC: '公开', SPACE: '空间' }

export function MemoCard({
  memo, serverUrl, tagColors, menuOpen, onMenuOpenChange, onChanged, onDeleted, onArchive, onEdit, onSelectTag
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  // The server owns the bucket; a missing `state` on older builds simply means "not archived".
  const archived = memo.state === 'ARCHIVED'
  const [error, setError] = useState('')
  const menuButton = useRef<HTMLButtonElement>(null)
  const html = useMemo(() => renderMarkdown(memo.content, tagColors), [memo.content, tagColors])

  async function run(action: () => Promise<{ success: boolean; data?: Memo; error?: string }>): Promise<void> {
    setBusy(true)
    setError('')
    const result = await action()
    if (result.success && result.data) onChanged(result.data)
    else if (!result.success) setError(result.error ?? '操作失败')
    setBusy(false)
  }

  async function remove(): Promise<void> {
    if (!window.confirm('删除这条记录？删除后无法恢复。')) return
    setBusy(true)
    const result = await window.api.memos.remove(memo.name)
    if (result.success) onDeleted(memo.name)
    else setError(result.error ?? '删除失败')
    setBusy(false)
  }

  function openLink(event: React.MouseEvent): void {
    const tagEl = (event.target as HTMLElement).closest('.md-tag') as HTMLElement | null
    if (tagEl?.dataset['tag']) {
      event.preventDefault()
      onSelectTag?.(tagEl.dataset['tag'])
      return
    }
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('href')
    if (!href) return
    // Server-relative links (attachments, images) only resolve against the Memos origin.
    window.open(href.startsWith('/') ? `${serverUrl.replace(/\/+$/, '')}${href}` : href, '_blank')
  }

  return (
    <article
      className={`note-card${busy ? ' busy' : ''}${menuOpen ? ' menu-open' : ''}${memo.pinned ? ' is-pinned' : ''}`}
      onDoubleClick={(event) => {
        // Only the card body opens the editor; buttons, links and tag chips keep their own click.
        if ((event.target as HTMLElement).closest('button, a, input, textarea, .md-tag')) return
        onEdit(memo)
      }}
    >
      <div className="card-tools">
        <button
          ref={menuButton}
          className="meta-btn"
          title="更多"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => onMenuOpenChange(!menuOpen)}
        >
          <MoreIcon size={16} />
        </button>
      </div>

      {menuOpen && (
        <CardMenu
          anchor={menuButton}
          pinned={Boolean(memo.pinned)}
          archived={archived}
          onClose={() => onMenuOpenChange(false)}
          onEdit={() => onEdit(memo)}
          onPin={() => { void togglePin() }}
          onArchive={() => onArchive(!archived)}
          onCopy={() => { void navigator.clipboard.writeText(memo.content) }}
          onDelete={() => { void remove() }}
        />
      )}

      <div className="markdown note-body break-words" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />

      <div className="meta-row">
        <span title={memo.createTime}>{relativeTime(memo.createTime)}</span>
        {memo.visibility !== 'PRIVATE' && <span>· {VISIBILITY_LABEL[memo.visibility] ?? memo.visibility}</span>}
        {memo.pinned && <span className="pinned-flag">· 置顶</span>}
        {archived && <span className="archived-flag">· 已归档</span>}
      </div>

      {error && <p className="inline-error" style={{ marginTop: 8 }}>{error}</p>}
    </article>
  )

  async function togglePin(): Promise<void> {
    await run(() => window.api.memos.update(memo.name, { pinned: !memo.pinned }))
  }
}
