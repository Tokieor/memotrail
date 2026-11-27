import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Memo } from '@shared/types'
import { relativeTime, renderMarkdown } from '../lib/markdown'
import { defaultTagColor, tagColorVar } from '../lib/tags'
import { CloseIcon, MoreIcon } from './Icons'

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

/** 折叠后保留的行数。 */
const FOLD_LINES = 4

/**
 * 把折叠高度对齐到「完整行」的底边。
 * 正文里混着标题、列表、代码块，行高各不相同（标题 20px、正文 23px、列表还有间距），
 * 直接按「行高 × 4」裁会把第四行切成半个字。这里量出每一行的实际矩形、
 * 把同一行被拆开的碎片合并，再取第 n 行的底。
 * 调用前需要处于 `measuring` 状态（max-height: none），否则量不到被裁掉的部分。
 */
function foldHeightToLineEdge(el: HTMLElement, targetLines: number): number {
  const base = el.getBoundingClientRect().top
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const rects: { top: number; bottom: number }[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.height > 0) rects.push({ top: rect.top - base, bottom: rect.bottom - base })
    }
  }
  if (rects.length === 0) return el.scrollHeight
  rects.sort((a, b) => a.top - b.top)
  const lines: { top: number; bottom: number }[] = []
  for (const rect of rects) {
    const last = lines[lines.length - 1]
    // 同一行里行内元素被拆成多个矩形，底边会重叠 —— 并成一行。
    if (last && rect.top < last.bottom - 1) last.bottom = Math.max(last.bottom, rect.bottom)
    else lines.push({ ...rect })
  }
  // 行数不够就没必要折叠，交给上层按「全部高度」处理。
  if (lines.length <= targetLines) return el.scrollHeight
  return Math.ceil(lines[targetLines - 1].bottom)
}

export function MemoCard({
  memo, serverUrl, tagColors, menuOpen, onMenuOpenChange, onChanged, onDeleted, onArchive, onEdit, onSelectTag
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  // The server owns the bucket; a missing `state` on older builds simply means "not archived".
  const archived = memo.state === 'ARCHIVED'
  // 清单主题用左侧小圆点标出笔记的主标签颜色，没标签时留一个淡点。
  const rowTag = memo.tags && memo.tags.length > 0 ? memo.tags[0] : null
  const rowDot = rowTag ? (tagColors?.[rowTag] ?? tagColorVar(defaultTagColor(rowTag))) : undefined
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const [inListMode, setInListMode] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const html = useMemo(() => renderMarkdown(memo.content, tagColors), [memo.content, tagColors])

  // 长笔记折叠：测量正文自然高度是否超过 4 行，只在超出时显示「展开」。
  useLayoutEffect(() => {
    const node = body.current
    if (!node) return
    const card = node.closest('.note-card')
    let lastWidth = card ? card.getBoundingClientRect().width : 0

    const measure = (): void => {
      const el = body.current
      if (!el) return
      // 列表模式本来就是单行预览，不参与折叠。
      if (el.closest('.list-mode')) {
        setInListMode(true)
        setCanExpand(false)
        return
      }
      setInListMode(false)
      const line = parseFloat(window.getComputedStyle(el).lineHeight) || 23
      // 先解除裁剪，才能量到被 max-height 藏掉的那几行；量完再把折叠高度写回去。
      el.classList.add('measuring')
      const full = el.scrollHeight
      const foldHeight = foldHeightToLineEdge(el, FOLD_LINES)
      el.style.setProperty('--fold-height', `${foldHeight}px`)
      el.classList.remove('measuring')
      // 只有明显超过 4 行（>6 行）才折叠：4~5 行的内容展开/收起肉眼无差别，
      // 还平白多一个按钮；留两行余量正好过滤掉这类边界内容。
      setCanExpand(full > foldHeight + line * 2)
    }

    measure()
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (Math.abs(width - lastWidth) > 1) {
        lastWidth = width
        measure()
      }
    })
    if (card) ro.observe(card)
    window.addEventListener('resize', measure)
    // 字号变化体现为 <html> 的 style 变更，同步重测。
    const mo = new MutationObserver(measure)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      mo.disconnect()
    }
  }, [html])

  // An attachment can disappear (deleted on the server, or an upload that was never bound to the
  // memo). Replace the browser's broken-image glyph with a quiet placeholder of the same size.
  useEffect(() => {
    const root = body.current
    if (!root) return
    const images = Array.from(root.querySelectorAll('img'))
    const watched: HTMLImageElement[] = []

    function replaceWithPlaceholder(image: HTMLImageElement): void {
      if (image.dataset['broken']) return
      image.dataset['broken'] = '1'
      const placeholder = document.createElement('span')
      placeholder.className = 'img-broken'
      placeholder.textContent = '图片不可用'
      image.replaceWith(placeholder)
    }

    function onError(event: Event): void {
      replaceWithPlaceholder(event.currentTarget as HTMLImageElement)
    }

    for (const image of images) {
      // A cached failure is already "complete" with no intrinsic size, before the listener attaches.
      if (image.complete && image.naturalWidth === 0) {
        replaceWithPlaceholder(image)
        continue
      }
      image.addEventListener('error', onError)
      watched.push(image)
    }
    return () => {
      for (const image of watched) image.removeEventListener('error', onError)
    }
  }, [html])

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
    const image = (event.target as HTMLElement).closest('img')
    if (image) {
      // Feed images are square thumbnails; a click opens the full picture.
      event.preventDefault()
      setLightbox({ src: image.src, alt: image.alt || '图片' })
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
      className={`note-card${busy ? ' busy' : ''}${menuOpen ? ' menu-open' : ''}${memo.pinned ? ' is-pinned' : ''}${rowDot ? ' has-dot' : ''}`}
      style={rowDot ? ({ '--row-dot': rowDot } as React.CSSProperties) : undefined}
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

      <div
        ref={body}
        className={`markdown note-body break-words${canExpand && !expanded && !inListMode ? ' clamped' : ''}`}
        onClick={openLink}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {canExpand && !inListMode && (
        <button
          className="expand-btn"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起' : '展开全文'}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
      )}

      <div className="meta-row">
        <span title={memo.createTime}>{relativeTime(memo.createTime)}</span>
        {memo.visibility !== 'PRIVATE' && <span>· {VISIBILITY_LABEL[memo.visibility] ?? memo.visibility}</span>}
        {memo.pinned && <span className="pinned-flag">· 置顶</span>}
        {archived && <span className="archived-flag">· 已归档</span>}
      </div>

      {error && <p className="inline-error" style={{ marginTop: 8 }}>{error}</p>}

      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)} title="关闭" aria-label="关闭">
            <CloseIcon size={18} />
          </button>
        </div>
      )}
    </article>
  )

  async function togglePin(): Promise<void> {
    await run(() => window.api.memos.update(memo.name, { pinned: !memo.pinned }))
  }
}
