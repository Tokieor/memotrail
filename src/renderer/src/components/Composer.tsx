import { useEffect, useRef, useState } from 'react'
import type { Memo, Visibility } from '@shared/types'

interface Props {
  /** When set the composer edits an existing memo instead of creating one. */
  memoName?: string
  initialContent?: string
  initialVisibility?: Visibility
  autoFocus?: boolean
  submitLabel?: string
  onSubmitted: (memo: Memo) => void
  onCancel?: () => void
}

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: 'PRIVATE', label: '私密' },
  { value: 'PROTECTED', label: '受保护' },
  { value: 'PUBLIC', label: '公开' }
]

export function Composer({
  memoName,
  initialContent = '',
  initialVisibility = 'PRIVATE',
  autoFocus = false,
  submitLabel,
  onSubmitted,
  onCancel
}: Props): JSX.Element {
  const [content, setContent] = useState(initialContent)
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setContent(initialContent)
    setVisibility(initialVisibility)
  }, [initialContent, initialVisibility, memoName])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  async function submit(): Promise<void> {
    const text = content.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    const result = memoName
      ? await window.api.memos.update(memoName, { content: text, visibility })
      : await window.api.memos.create(text, visibility)
    if (result.success && result.data) {
      if (!memoName) setContent('')
      onSubmitted(result.data)
    } else {
      setError(result.error ?? '保存失败')
    }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        rows={memoName ? 5 : 3}
        placeholder="记点什么…支持 Markdown 和 #标签（⌘/Ctrl + Enter 保存）"
        className="w-full resize-none bg-transparent outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="rounded-md border bg-transparent px-1.5 py-1 text-xs outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            {VISIBILITIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: error ? '#d33' : 'var(--text-soft)' }}>
            {error || `${content.trim().length} 字`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button onClick={onCancel} className="rounded-lg px-2 py-1 text-sm" style={{ color: 'var(--text-soft)' }}>
              取消
            </button>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy || !content.trim()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? '保存中…' : (submitLabel ?? (memoName ? '保存修改' : '记下'))}
          </button>
        </div>
      </div>
    </div>
  )
}
