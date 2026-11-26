import { useEffect, useRef, useState } from 'react'
import type { Memo, Visibility } from '@shared/types'
import { formatAccelerator } from '../lib/accelerator'
import { fileToBase64, isImage } from '../lib/files'
import { caretPoint, filterTags, findTagQuery, type CaretPoint } from '../lib/tag-suggest'
import { CodeBlockIcon, CodeIcon, HeadingIcon, ImageIcon, LinkIcon, ListIcon, QuoteIcon } from './Icons'
import { VisibilityPicker } from './VisibilityPicker'

interface Props {
  /** When set the composer edits an existing memo instead of creating one. */
  memoName?: string
  initialContent?: string
  initialVisibility?: Visibility
  autoFocus?: boolean
  submitLabel?: string
  /** Bump to focus the textarea from a keyboard shortcut. */
  focusSignal?: number
  /** 'feed' = inline quick capture; 'editor' = full detail/edit card. */
  variant?: 'feed' | 'editor'
  /** Most-used tags offered after typing `#`. */
  tagSuggestions?: string[]
  /** Called when the visibility selector changes, so the editor can reflect it. */
  onSubmitted: (memo: Memo) => void
  onCancel?: () => void
}

const DRAFT_KEY = 'memotrail.composer.draft'

export function Composer({
  memoName,
  initialContent = '',
  initialVisibility = 'PRIVATE',
  autoFocus = false,
  focusSignal = 0,
  submitLabel,
  variant = 'feed',
  tagSuggestions = [],
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
  const [suggest, setSuggest] = useState<{ start: number; query: string; index: number; point: CaretPoint } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const options = suggest ? filterTags(tagSuggestions, suggest.query) : []

  /** Opens the tag menu anchored under the `#` the caret is sitting on. */
  function syncSuggest(value: string, caret: number): void {
    const element = ref.current
    const query = findTagQuery(value, caret)
    if (!query || !element) {
      setSuggest(null)
      return
    }
    const point = caretPoint(element, caret)
    setSuggest((prev) => ({
      ...query,
      index: prev && prev.start === query.start ? Math.min(prev.index, 7) : 0,
      point
    }))
  }

  function applyTag(tag: string): void {
    const element = ref.current
    if (!suggest || !element) return
    const caret = element.selectionStart
    const next = `${content.slice(0, suggest.start)}#${tag} ${content.slice(caret)}`
    const position = suggest.start + tag.length + 2
    setContent(next)
    setSuggest(null)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(position, position)
    })
  }

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

  type MarkKind = 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'heading' | 'list' | 'quote' | 'link' | 'codeblock'

  /**
   * Applies a Markdown format to the textarea selection.
   * Paired marks wrap the selection (or insert `mark|mark` with the caret between); clicking an
   * already-wrapped selection toggles the mark off. Line marks prefix every selected line.
   */
  function applyFormat(kind: MarkKind): void {
    const element = ref.current
    if (!element) return
    // Read the live DOM value so the format always applies to what the user actually sees,
    // even if React state hasn't caught up (IME composition, rapid clicks).
    const current = element.value
    const start = element.selectionStart
    const end = element.selectionEnd
    const selected = current.slice(start, end)
    let next = current
    let selStart = start
    let selEnd = end

    if (kind === 'heading' || kind === 'list' || kind === 'quote') {
      const prefix = kind === 'heading' ? '## ' : kind === 'list' ? '- ' : '> '
      const lineStart = current.lastIndexOf('\n', start - 1) + 1
      const lineEndIndex = current.indexOf('\n', end)
      const lineEnd = lineEndIndex === -1 ? current.length : lineEndIndex
      const block = current.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      // If every selected line already has the prefix, remove it; otherwise add it.
      const allPrefixed = lines.every((line) => line.startsWith(prefix))
      const changed = lines
        .map((line) => allPrefixed ? line.slice(prefix.length) : prefix + line)
        .join('\n')
      next = current.slice(0, lineStart) + changed + current.slice(lineEnd)
      selStart = lineStart
      selEnd = lineStart + changed.length
    } else if (kind === 'codeblock') {
      const wrapped = `\n\`\`\`\n${selected}\n\`\`\`\n`
      next = current.slice(0, start) + wrapped + current.slice(end)
      selStart = start + 4
      selEnd = selStart + selected.length
    } else if (kind === 'link') {
      const label = selected || '链接文字'
      const snippet = `[${label}](url)`
      next = current.slice(0, start) + snippet + current.slice(end)
      selStart = start + label.length + 3
      selEnd = selStart + 3 // select "url" for quick replacement
    } else {
      const marks: Record<'bold' | 'italic' | 'strike' | 'underline' | 'code', [string, string]> = {
        bold: ['**', '**'],
        italic: ['*', '*'],
        strike: ['~~', '~~'],
        underline: ['<u>', '</u>'],
        code: ['`', '`']
      }
      const [open, close] = marks[kind]
      // Toggle off when the selection is already wrapped by this mark.
      if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
        const inner = selected.slice(open.length, selected.length - close.length)
        next = current.slice(0, start) + inner + current.slice(end)
        selStart = start
        selEnd = start + inner.length
      } else {
        next = current.slice(0, start) + open + selected + close + current.slice(end)
        selStart = start + open.length
        selEnd = selStart + selected.length
        // With no selection, leave the caret between the marks so typing goes inside.
        if (selected.length === 0) selStart = selEnd = start + open.length
      }
    }

    setContent(next)
    setSuggest(null)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(selStart, selEnd)
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

  const isEditor = variant === 'editor'

  return (
    <div className={isEditor ? 'editor-composer' : 'composer'}>
      <div className="composer-input">
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          syncSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={(e) => {
          if (suggest && options.length > 0) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : -1
              setSuggest((prev) => prev && { ...prev, index: (prev.index + step + options.length) % options.length })
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              applyTag(options[Math.min(suggest.index, options.length - 1)])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSuggest(null)
              return
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        rows={isEditor ? 12 : 3}
        placeholder={isEditor
          ? '写下你的想法…支持 Markdown 与 #标签，可直接粘贴或拖入图片'
          : '此刻有什么想记录的？换个标签，或直接开始写…'}
        className={isEditor ? 'editor-textarea' : ''}
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

      {suggest && options.length > 0 && (() => {
        const { point } = suggest
        const boxWidth = 200
        const maxLeft = Math.max(4, (ref.current?.clientWidth ?? boxWidth) - boxWidth)
        const left = Math.max(4, Math.min(point.left, maxLeft))
        const flipUp = point.top > point.height * 0.55
        const placement = flipUp
          ? { left, bottom: point.height - point.top + 4 }
          : { left, top: point.top + point.lineHeight + 4 }
        return (
        <div className="tag-suggest" role="listbox" style={placement}>
          {options.map((tag, index) => (
            <button
              key={tag}
              type="button"
              role="option"
              aria-selected={index === suggest.index}
              className={`tag-suggest-item${index === suggest.index ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyTag(tag) }}
              onMouseEnter={() => setSuggest((prev) => prev && { ...prev, index })}
            >
              #{tag}
            </button>
          ))}
        </div>
        )
      })()}
      </div>

      <div className="md-toolbar" role="toolbar" aria-label="Markdown 格式">
        <button type="button" className="md-btn md-bold" title="加粗 **文字**" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')}>B</button>
        <button type="button" className="md-btn md-italic" title="斜体 *文字*" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')}>I</button>
        <button type="button" className="md-btn md-strike" title="删除线 ~~文字~~" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('strike')}>S</button>
        <button type="button" className="md-btn md-underline" title="下划线 <u>文字</u>" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')}>U</button>
        <span className="md-sep" />
        <button type="button" className="md-btn" title="标题 ##" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('heading')}><HeadingIcon size={15} /></button>
        <button type="button" className="md-btn" title="列表 -" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('list')}><ListIcon size={15} /></button>
        <button type="button" className="md-btn" title="引用 >" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('quote')}><QuoteIcon size={15} /></button>
        <span className="md-sep" />
        <button type="button" className="md-btn" title="行内代码 `文字`" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('code')}><CodeIcon size={15} /></button>
        <button type="button" className="md-btn" title="代码块" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('codeblock')}><CodeBlockIcon size={15} /></button>
        <button type="button" className="md-btn" title="链接 [文字](url)" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('link')}><LinkIcon size={15} /></button>
      </div>

      {error && <p className="inline-error" style={{ margin: '4px 0 8px' }}>{error}</p>}

      {!isEditor && <div className="composer-divider" />}

      <div className="composer-footer">
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        <button
          className="tool-btn plain"
          onClick={() => {
            const position = ref.current?.selectionStart ?? content.length
            insertAtCursor('#')
            const element = ref.current
            if (element && tagSuggestions.length > 0) {
              setSuggest({ start: position, query: '', index: 0, point: caretPoint(element, position + 1) })
            }
          }}
          title="插入标签 #"
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>#</span>
        </button>
        <button className="tool-btn plain" onClick={() => fileInput.current?.click()} disabled={uploading} title="添加图片/附件">
          <ImageIcon size={17} />
        </button>
        <button className="tool-btn plain" onClick={() => insertAtCursor('[]()')} title="插入链接">
          <LinkIcon size={17} />
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
        <span className="spacer" />
        <span className="quick-hint">{error ? '' : `${content.trim().length} 字`} · {formatAccelerator('CommandOrControl+Enter')} 保存</span>
        {onCancel && (
          <button className="ghost-btn" onClick={onCancel}>取消</button>
        )}
        <button
          className="primary-btn"
          onClick={() => void submit()}
          disabled={busy || !content.trim()}
        >
          {busy ? '保存中…' : (submitLabel ?? (memoName ? '保存修改' : '记一笔'))}
        </button>
      </div>
    </div>
  )
}
