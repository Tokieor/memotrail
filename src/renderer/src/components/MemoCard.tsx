import { useMemo, useState } from 'react'
import type { Memo } from '@shared/types'
import { relativeTime, renderMarkdown } from '../lib/markdown'
import { HashChipIcon, MoreIcon, StarIcon } from './Icons'

interface Props {
  memo: Memo
  serverUrl: string
  onChanged: (memo: Memo) => void
  onDeleted: (name: string) => void
  onEdit: (memo: Memo) => void
  onSelectTag?: (tag: string) => void
}

const VISIBILITY_LABEL: Record<string, string> = { PRIVATE: '私密', PROTECTED: '受保护', PUBLIC: '公开', SPACE: '空间' }

function toneFor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0
  return ['green', 'amber', 'blue', 'rose'][Math.abs(hash) % 4]
}

export function MemoCard({ memo, serverUrl, onChanged, onDeleted, onEdit, onSelectTag }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const html = useMemo(() => renderMarkdown(memo.content), [memo.content])

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
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('href')
    if (!href) return
    // Server-relative links (attachments, images) only resolve against the Memos origin.
    window.open(href.startsWith('/') ? `${serverUrl.replace(/\/+$/, '')}${href}` : href, '_blank')
  }

  return (
    <article className={`note-card${busy ? ' busy' : ''}`}>
      <div className="card-tools">
        <button className="meta-btn" title="更多" onClick={() => setMenuOpen((v) => !v)}>
          <MoreIcon size={16} />
        </button>
        {menuOpen && (
          <div className="card-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button className="action-btn" onClick={() => { setMenuOpen(false); onEdit(memo) }}>编辑</button>
            <button className="action-btn" onClick={() => { setMenuOpen(false); void navigator.clipboard.writeText(memo.content) }}>复制</button>
            <button className="action-btn danger" onClick={() => { setMenuOpen(false); void remove() }}>删除</button>
          </div>
        )}
      </div>

      {(memo.tags ?? []).length > 0 && (
        <div className="tag-row tag-row-compact">
          {(memo.tags ?? []).map((tag) => (
            <button key={tag} className={`tag-chip ${toneFor(tag)}`} onClick={() => onSelectTag?.(tag)}>
              <HashChipIcon size={11} />
              <span>{tag}</span>
            </button>
          ))}
        </div>
      )}

      <div className="markdown note-body break-words" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />

      <div className="meta-row">
        <span title={memo.createTime}>{relativeTime(memo.createTime)}</span>
        {memo.visibility !== 'PRIVATE' && <span>· {VISIBILITY_LABEL[memo.visibility] ?? memo.visibility}</span>}
        {memo.pinned && <span>· 已置顶</span>}
        <span className="spacer" />
        <button
          className={`meta-btn${memo.pinned ? ' on' : ''}`}
          title={memo.pinned ? '取消置顶' : '置顶'}
          onClick={() => void run(() => window.api.memos.update(memo.name, { pinned: !memo.pinned }))}
        >
          <StarIcon size={14} filled={Boolean(memo.pinned)} />
        </button>
      </div>

      {error && <p className="inline-error" style={{ marginTop: 8 }}>{error}</p>}
    </article>
  )
}
