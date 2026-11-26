import { useEffect, useRef, useState } from 'react'
import type { Memo, Visibility } from '@shared/types'
import { fileToBase64, isImage } from '../lib/files'

interface Props {
  /** When set the composer edits an existing memo instead of creating one. */
  memoName?: string
  initialContent?: string
  initialVisibility?: Visibility
  autoFocus?: boolean
  submitLabel?: string
  /** Bump to focus the textarea from a keyboard shortcut. */
  focusSignal?: number
  onSubmitted: (memo: Memo) => void
  onCancel?: () => void
}

const DRAFT_KEY = 'memotrail.composer.draft'

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
  focusSignal = 0,
  submitLabel,
  onSubmitted,
  onCancel
}: Props): JSX.Element {
  const [content, setContent] = useState(() =>
    memoName || initialContent ? initialContent : (localStorage.getItem(DRAFT_KEY) ?? '')
  )
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setContent(initialContent)
    setVisibility(initialVisibility)
  }, [initialContent, initialVisibility, memoName])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (focusSignal > 0) ref.current?.focus()
  }, [focusSignal])

  // Unsubmitted new memos survive a window reload; edits keep their own source of truth.
  useEffect(() => {
    if (memoName) return
    if (content) localStorage.setItem(DRAFT_KEY, content)
    else localStorage.removeItem(DRAFT_KEY)
  }, [content, memoName])

  function insertAtCursor(text: string): void {
    const element = ref.current
    const position = element?.selectionStart ?? content.length
    setContent((current) => current.slice(0, position) + text + current.slice(position))
    requestAnimationFrame(() => {
      element?.focus()
      const next = position + text.length
      element?.setSelectionRange(next, next)
    })
  }

  async function upload(file: File): Promise<void> {
    if (uploading) return
    setUploading(true)
    setError('')
    try {
      const data = await fileToBase64(file)
      const result = await window.api.attachments.upload({
        filename: file.name,
        type: file.type || 'application/octet-stream',
        data
      })
      if (result.success && result.data) {
        const id = result.data.name.split('/')[1]
        const url = `/file/attachments/${id}/${encodeURIComponent(result.data.filename)}`
        insertAtCursor(isImage(result.data) ? `![${result.data.filename}](${url})` : `[${result.data.filename}](${url})`)
      } else {
        setError(result.error ?? '上传失败')
      }
    } catch (err) {
      setError((err as Error).message)
    }
    setUploading(false)
  }

  async function submit(): Promise<void> {
    const text = content.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    const result = memoName
      ? await window.api.memos.update(memoName, { content: text, visibility })
      : await window.api.memos.create(text, visibility)
    if (result.success && result.data) {
      if (!memoName) {
        setContent('')
        localStorage.removeItem(DRAFT_KEY)
      }
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
        placeholder="记点什么…支持 Markdown 和 #标签（⌘/Ctrl + Enter 保存，可直接粘贴/拖入图片）"
        className="w-full resize-none bg-transparent outline-none"
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.length === 0) return
          e.preventDefault()
          for (const file of files) void upload(file)
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files)
          if (files.length === 0) return
          e.preventDefault()
          for (const file of files) void upload(file)
        }}
        onDragOver={(e) => e.preventDefault()}
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
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="rounded-md border px-1.5 py-0.5 text-xs disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            {uploading ? '上传中…' : '附件'}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) void upload(file)
              e.target.value = ''
            }}
          />
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
