import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Memo, Visibility } from '@shared/types'
import { formatAccelerator } from '../lib/accelerator'
import { fileToBase64, isImage } from '../lib/files'
import { htmlToMarkdown, renderMarkdown } from '../lib/markdown'
import { caretPoint, filterTags, findTagQuery, type CaretPoint } from '../lib/tag-suggest'
import {
  CodeBlockIcon, CodeIcon, EyeIcon, HeadingIcon, ImageIcon,
  LinkIcon, ListIcon, QuoteIcon
} from './Icons'
import { VisibilityPicker } from './VisibilityPicker'

interface Props {
  /** When set the composer edits an existing memo instead of creating one. */
  memoName?: string
  initialContent?: string
  initialVisibility?: Visibility
  autoFocus?: boolean
  submitLabel?: string
  /** Bump to focus the editor from a keyboard shortcut. */
  focusSignal?: number
  /** 'feed' = inline quick capture; 'editor' = full detail/edit card. */
  variant?: 'feed' | 'editor'
  /** Most-used tags offered after typing `#`. */
  tagSuggestions?: string[]
  onSubmitted: (memo: Memo) => void
  onCancel?: () => void
}

type EditMode = 'preview' | 'source'
type MarkKind = 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'heading' | 'list' | 'quote' | 'link' | 'codeblock'

const DRAFT_KEY = 'memotrail.composer.draft'
const PLACEHOLDER = '此刻有什么想记录的？换个标签，或直接开始写…'

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
  const [mode, setMode] = useState<EditMode>('preview')
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [suggest, setSuggest] = useState<{ start: number; query: string; index: number; point: CaretPoint } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const contentRef = useRef(content)
  contentRef.current = content

  const isEditor = variant === 'editor'
  /** Preview mode shows the placeholder only while the source is genuinely empty. */
  const isEmpty = content.trim().length === 0
  const options = useMemo(
    () => suggest ? filterTags(tagSuggestions, suggest.query) : [],
    [suggest, tagSuggestions]
  )

  /**
   * Writes markdown source into the WYSIWYG surface without going through React re-render.
   * Empty source clears the node entirely — the placeholder is a separate overlay element, so
   * nothing is left inside the editable region for typed text to sit behind.
   */
  function paintPreview(source: string): void {
    const el = previewRef.current
    if (!el) return
    el.innerHTML = source.trim() ? renderMarkdown(source) : ''
  }

  // External content replacement (editing a different memo) updates both state and the preview DOM.
  // Skips the first render so a restored draft is never overwritten by an empty initialContent.
  const prevInit = useRef({ memoName, initialContent })
  useEffect(() => {
    const changed =
      prevInit.current.memoName !== memoName ||
      prevInit.current.initialContent !== initialContent
    prevInit.current = { memoName, initialContent }
    if (!changed) return
    setContent(initialContent)
    contentRef.current = initialContent
    setVisibility(initialVisibility)
    if (mode === 'preview') paintPreview(initialContent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, initialVisibility, memoName])

  // Repaint after the surface mounts so switching modes always shows the latest source.
  useLayoutEffect(() => {
    if (mode === 'preview') paintPreview(contentRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (autoFocus) (mode === 'source' ? ref.current : previewRef.current)?.focus()
  }, [autoFocus, mode])

  useEffect(() => {
    if (focusSignal > 0) (mode === 'source' ? ref.current : previewRef.current)?.focus()
  }, [focusSignal, mode])

  // Unsubmitted new memos survive a window reload.
  useEffect(() => {
    if (memoName) return
    if (content) localStorage.setItem(DRAFT_KEY, content)
    else localStorage.removeItem(DRAFT_KEY)
  }, [content, memoName])

  function switchMode(next: EditMode): void {
    if (next === mode) return
    setSuggest(null)
    // Capture any pending WYSIWYG edits before leaving preview, so the source view is exact.
    if (mode === 'preview' && previewRef.current) {
      const md = htmlToMarkdown(previewRef.current.innerHTML)
      contentRef.current = md
      setContent(md)
    }
    // Painting / focusing happens in the layout effect once the new surface is mounted.
    setMode(next)
  }

  /** Preview editing: read rendered HTML back into Markdown source state. */
  function onPreviewInput(): void {
    const el = previewRef.current
    if (!el) return
    setContent(htmlToMarkdown(el.innerHTML))
  }

  /** Opens the tag menu anchored under the `#` the caret is sitting on (source mode only). */
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

  function insertAtCursor(text: string): void {
    if (mode === 'preview') {
      const el = previewRef.current
      if (!el) return
      el.focus()
      document.execCommand('insertHTML', false, renderMarkdown(text))
      setContent(htmlToMarkdown(el.innerHTML))
      return
    }
    const element = ref.current
    const position = element?.selectionStart ?? content.length
    setContent((current) => current.slice(0, position) + text + current.slice(position))
    requestAnimationFrame(() => {
      element?.focus()
      const next = position + text.length
      element?.setSelectionRange(next, next)
    })
  }

  /**
   * Moves the caret to just after `node` so subsequent typing is not swallowed by an active
   * inline format (the classic contenteditable "everything stays bold" bug).
   */
  function placeCaretAfter(node: Node): void {
    const range = document.createRange()
    range.setStartAfter(node)
    range.collapse(true)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /** After formatting a selection, park the caret outside the styled element and clear the state. */
  function settleAfterInline(tagNames: string[]): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    let node: Node | null = selection.anchorNode
    let styled: Node | null = null
    while (node && node !== previewRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE && tagNames.includes((node as Element).tagName.toLowerCase())) {
        styled = node
        break
      }
      node = node.parentNode
    }
    if (styled) placeCaretAfter(styled)
    // Toggling the command off at a collapsed caret clears the "pending" bold/italic state
    // without touching the content that was just styled.
    for (const cmd of ['bold', 'italic', 'strikeThrough', 'underline']) {
      if (document.queryCommandState(cmd)) document.execCommand(cmd)
    }
  }

  /**
   * Applies Markdown formatting. Source mode manipulates the text directly; preview mode uses
   * the browser's native rich-text commands. In both cases the caret ends up AFTER the inserted
   * mark (nothing selected), so typing continues normally.
   */
  function applyFormat(kind: MarkKind): void {
    if (mode === 'preview') {
      const el = previewRef.current
      if (!el) return
      el.focus()
      // Only single-line inline marks need the caret fix; block commands manage their own caret.
      let inlineTags: string[] | null = null
      switch (kind) {
        case 'bold': document.execCommand('bold'); inlineTags = ['b', 'strong']; break
        case 'italic': document.execCommand('italic'); inlineTags = ['i', 'em']; break
        case 'strike': document.execCommand('strikeThrough'); inlineTags = ['strike', 's', 'del']; break
        case 'underline': document.execCommand('underline'); inlineTags = ['u']; break
        case 'heading': document.execCommand('formatBlock', false, 'h2'); break
        case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break
        case 'list': document.execCommand('insertUnorderedList'); break
        case 'code': {
          const selection = window.getSelection()
          const text = selection?.toString() ?? ''
          document.execCommand('insertHTML', false, `<code>${text || '代码'}</code>`)
          inlineTags = ['code']
          break
        }
        case 'codeblock': document.execCommand('formatBlock', false, 'pre'); break
        case 'link': {
          const selection = window.getSelection()
          const label = selection?.toString() || '链接文字'
          document.execCommand('insertHTML', false, `<a href="https://">${label}</a>`)
          inlineTags = ['a']
          break
        }
      }
      if (inlineTags) settleAfterInline(inlineTags)
      setContent(htmlToMarkdown(el.innerHTML))
      return
    }

    const element = ref.current
    if (!element) return
    const current = element.value
    const start = element.selectionStart
    const end = element.selectionEnd
    const selected = current.slice(start, end)
    let next = current
    let caret = end

    if (kind === 'heading' || kind === 'list' || kind === 'quote') {
      const prefix = kind === 'heading' ? '## ' : kind === 'list' ? '- ' : '> '
      const lineStart = current.lastIndexOf('\n', start - 1) + 1
      const lineEndIndex = current.indexOf('\n', end)
      const lineEnd = lineEndIndex === -1 ? current.length : lineEndIndex
      const lines = current.slice(lineStart, lineEnd).split('\n')
      const allPrefixed = lines.every((line) => line.startsWith(prefix))
      const changed = lines.map((line) => allPrefixed ? line.slice(prefix.length) : prefix + line).join('\n')
      next = current.slice(0, lineStart) + changed + current.slice(lineEnd)
      caret = lineStart + (allPrefixed ? 0 : prefix.length)
    } else if (kind === 'codeblock') {
      const wrapped = `\n\`\`\`\n${selected}\n\`\`\`\n`
      next = current.slice(0, start) + wrapped + current.slice(end)
      caret = start + wrapped.length
    } else if (kind === 'link') {
      const label = selected || '链接文字'
      const snippet = `[${label}](https://)`
      next = current.slice(0, start) + snippet + current.slice(end)
      caret = start + snippet.length
    } else {
      const marks: Record<'bold' | 'italic' | 'strike' | 'underline' | 'code', [string, string]> = {
        bold: ['**', '**'],
        italic: ['*', '*'],
        strike: ['~~', '~~'],
        underline: ['<u>', '</u>'],
        code: ['`', '`']
      }
      const [open, close] = marks[kind]
      // Toggle off when the selection is already wrapped.
      if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
        const inner = selected.slice(open.length, selected.length - close.length)
        next = current.slice(0, start) + inner + current.slice(end)
        caret = start + inner.length
      } else {
        next = current.slice(0, start) + open + selected + close + current.slice(end)
        // Caret goes after the trailing mark — nothing stays selected.
        caret = start + open.length + selected.length + close.length
      }
    }

    setContent(next)
    setSuggest(null)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(caret, caret)
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
        if (mode === 'preview') paintPreview('')
        localStorage.removeItem(DRAFT_KEY)
      }
      onSubmitted(result.data)
    } else {
      setError(result.error ?? '保存失败')
    }
    setBusy(false)
  }

  return (
    <div className={isEditor ? 'editor-composer' : 'composer'}>
      <div className="composer-input">
        {mode === 'preview' ? (
          <div
            ref={previewRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            className={`composer-preview markdown${isEditor ? ' editor-textarea' : ''}`}
            onInput={onPreviewInput}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
              if (e.key === 'Escape' && onCancel) onCancel()
            }}
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
        ) : (
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
            placeholder={PLACEHOLDER}
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
        )}

        {mode === 'preview' && isEmpty && (
          <div className={`composer-placeholder${isEditor ? ' editor-placeholder' : ''}`} aria-hidden="true">
            {PLACEHOLDER}
          </div>
        )}

        {suggest && mode === 'source' && options.length > 0 && (() => {
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
        <button type="button" className="md-btn md-bold" title="加粗 **文字**" data-tip="加粗" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')}>B</button>
        <button type="button" className="md-btn md-italic" title="斜体 *文字*" data-tip="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')}>I</button>
        <button type="button" className="md-btn md-strike" title="删除线 ~~文字~~" data-tip="删除线" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('strike')}>S</button>
        <button type="button" className="md-btn md-underline" title="下划线 <u>文字</u>" data-tip="下划线" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')}>U</button>
        <span className="md-sep" />
        <button type="button" className="md-btn" title="标题 ##" data-tip="标题" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('heading')}><HeadingIcon size={15} /></button>
        <button type="button" className="md-btn" title="列表 -" data-tip="列表" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('list')}><ListIcon size={15} /></button>
        <button type="button" className="md-btn" title="引用 >" data-tip="引用" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('quote')}><QuoteIcon size={15} /></button>
        <span className="md-sep" />
        <button type="button" className="md-btn" title="行内代码 `文字`" data-tip="行内代码" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('code')}><CodeIcon size={15} /></button>
        <button type="button" className="md-btn" title="代码块" data-tip="代码块" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('codeblock')}><CodeBlockIcon size={15} /></button>
        <button type="button" className="md-btn" title="链接 [文字](url)" data-tip="链接" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('link')}><LinkIcon size={15} /></button>
      </div>

      {error && <p className="inline-error" style={{ margin: '4px 0 6px' }}>{error}</p>}

      {!isEditor && <div className="composer-divider" />}

      <div className="composer-footer">
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        <button
          className="tool-btn plain"
          onClick={() => {
            if (mode === 'preview') {
              insertAtCursor('#')
            } else {
              const position = ref.current?.selectionStart ?? content.length
              insertAtCursor('#')
              const element = ref.current
              if (element && tagSuggestions.length > 0) {
                setSuggest({ start: position, query: '', index: 0, point: caretPoint(element, position + 1) })
              }
            }
          }}
          title="插入标签 #" data-tip="插入标签"
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>#</span>
        </button>
        <button className="tool-btn plain" onClick={() => fileInput.current?.click()} disabled={uploading} title="添加图片/附件" data-tip="添加图片">
          <ImageIcon size={17} />
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
        <button
          className={`tool-btn plain${mode === 'preview' ? ' active' : ''}`}
          onClick={() => switchMode('preview')}
          title="预览（所见即所得）" data-tip="预览"
        >
          <EyeIcon size={17} />
        </button>
        <button
          className={`tool-btn plain${mode === 'source' ? ' active' : ''}`}
          onClick={() => switchMode('source')}
          title="源代码（Markdown）" data-tip="源代码"
        >
          <CodeIcon size={17} />
        </button>
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
