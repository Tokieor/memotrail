import { useState } from 'react'
import type { Memo } from '@shared/types'

interface Props {
  onCreated: (memo: Memo) => void
}

export function Composer({ onCreated }: Props): JSX.Element {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(): Promise<void> {
    const text = content.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    const result = await window.api.memos.create(text, 'PRIVATE')
    if (result.success && result.data) {
      setContent('')
      onCreated(result.data)
    } else {
      setError(result.error ?? '发送失败')
    }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
        rows={3}
        placeholder="记点什么…（⌘/Ctrl + Enter 发送）"
        className="w-full resize-none bg-transparent outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs" style={{ color: error ? '#d33' : 'var(--text-soft)' }}>
          {error || `${content.trim().length} 字`}
        </span>
        <button
          onClick={() => void submit()}
          disabled={busy || !content.trim()}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {busy ? '发送中…' : '记下'}
        </button>
      </div>
    </div>
  )
}
