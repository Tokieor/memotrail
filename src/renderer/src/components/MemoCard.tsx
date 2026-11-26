import { useMemo, useState } from 'react'
import type { Memo } from '@shared/types'
import { relativeTime, renderMarkdown } from '../lib/markdown'

interface Props {
  memo: Memo
  serverUrl: string
  onChanged: (memo: Memo) => void
  onDeleted: (name: string) => void
  onEdit: (memo: Memo) => void
}

const VISIBILITY_LABEL: Record<string, string> = { PRIVATE: '私密', PROTECTED: '受保护', PUBLIC: '公开', SPACE: '空间' }

export function MemoCard({ memo, serverUrl, onChanged, onDeleted, onEdit }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    <article
      className="group rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)', opacity: busy ? 0.6 : 1 }}
    >
      <div className="markdown break-words" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />

      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--text-soft)' }}>
        <div className="flex items-center gap-2">
          <span title={memo.createTime}>{relativeTime(memo.createTime)}</span>
          {memo.visibility !== 'PRIVATE' && <span>· {VISIBILITY_LABEL[memo.visibility] ?? memo.visibility}</span>}
          {memo.pinned && <span>· 已置顶</span>}
          {memo.tags?.map((tag) => (
            <span key={tag} style={{ color: 'var(--accent)' }}>
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton label={memo.pinned ? '取消置顶' : '置顶'} onClick={() => void run(() => window.api.memos.update(memo.name, { pinned: !memo.pinned }))}>
            {memo.pinned ? '取消置顶' : '置顶'}
          </IconButton>
          <IconButton label="编辑" onClick={() => onEdit(memo)}>
            编辑
          </IconButton>
          <IconButton label="复制" onClick={() => void navigator.clipboard.writeText(memo.content)}>
            复制
          </IconButton>
          <IconButton label="删除" onClick={() => void remove()}>
            删除
          </IconButton>
        </div>
      </div>

      {error && (
        <p className="mt-1 text-xs" style={{ color: '#d33' }}>
          {error}
        </p>
      )}
    </article>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      title={label}
      onClick={onClick}
      className="rounded-md px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </button>
  )
}
