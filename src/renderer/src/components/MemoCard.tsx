import type { Memo } from '@shared/types'

const TAG = /(^|\s)(#[\p{L}\p{N}_/-]+)/gu

function withTags(content: string): JSX.Element[] {
  const parts: JSX.Element[] = []
  let last = 0
  let key = 0
  for (const match of content.matchAll(TAG)) {
    const start = (match.index ?? 0) + match[1].length
    if (start > last) parts.push(<span key={key++}>{content.slice(last, start)}</span>)
    parts.push(
      <span key={key++} style={{ color: 'var(--accent)' }}>
        {match[2]}
      </span>
    )
    last = start + match[2].length
  }
  if (last < content.length) parts.push(<span key={key++}>{content.slice(last)}</span>)
  return parts
}

function when(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function MemoCard({ memo }: { memo: Memo }): JSX.Element {
  return (
    <article className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
      <div className="whitespace-pre-wrap break-words">{withTags(memo.content)}</div>
      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
        <span>{when(memo.createTime)}</span>
        {memo.visibility !== 'PRIVATE' && <span>· {memo.visibility === 'PUBLIC' ? '公开' : '受保护'}</span>}
        {memo.pinned && <span>· 已置顶</span>}
      </div>
    </article>
  )
}
