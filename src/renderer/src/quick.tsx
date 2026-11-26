import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  BoltIcon, CodeBlockIcon, CodeIcon, HeadingIcon, ImageIcon, LinkIcon, ListIcon, QuoteIcon, SendIcon
} from './components/Icons'
import { VisibilityPicker } from './components/VisibilityPicker'
import { formatAccelerator } from './lib/accelerator'
import { applyCachedTheme, applyTheme, watchSystemAppearance } from './lib/theme'
import { caretPoint, filterTags, findTagQuery, type CaretPoint } from './lib/tag-suggest'
import { visibleLength } from './lib/text'

type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'
type State = 'idle' | 'sending' | 'done' | 'error'

const DRAFT_KEY = 'memotrail.quick.draft'
const VISIBILITY_LABEL: Record<Visibility, string> = { PRIVATE: '私密', PROTECTED: '登录可见', PUBLIC: '公开' }

function QuickCapture(): JSX.Element {
  const [content, setContent] = useState(() => localStorage.getItem(DRAFT_KEY) ?? '')
  const [visibility, setVisibility] = useState<Visibility>('PRIVATE')
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+M')
  const [tags, setTags] = useState<string[]>([])
  const [suggest, setSuggest] = useState<{ start: number; query: string; index: number; point: CaretPoint } | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    input.current?.focus()
    void (async () => {
      const config = await window.api.config.get()
      setConfigured(Boolean(config?.serverUrl))
      if (config?.quickHotkey) setHotkey(config.quickHotkey)
      if (config?.theme) applyTheme(config.theme, config.appearance)
      const status = await window.api.auth.status()
      if (status.success && status.data) {
        const preferred = status.data?.defaultVisibility as Visibility | undefined
        if (preferred && preferred in VISIBILITY_LABEL) setVisibility(preferred)
      }
    })()
  }, [])

  useEffect(() => window.api.config.onChange((next) => {
    setHotkey(next.quickHotkey)
    applyTheme(next.theme, next.appearance)
  }), [])

  useEffect(() => {
    applyCachedTheme()
    void window.api.config.get().then((config) => {
      applyTheme(config.theme, config.appearance)
      return watchSystemAppearance(config.theme, config.appearance)
    })
  }, [])

  // 最近用过的标签：拿一页笔记现算，拿不到就算了（未登录/离线时静默）。
  useEffect(() => {
    void (async () => {
      // Archived notes should not feed the tag suggestions for a fresh capture.
      const result = await window.api.memos.list({ pageSize: 30, state: 'NORMAL' })
      if (!result.success || !result.data) return
      const counts = new Map<string, number>()
      for (const memo of result.data.memos) {
        for (const tag of memo.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      setTags([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag).slice(0, 12))
    })()
  }, [])

  const options = suggest ? filterTags(tags, suggest.query) : []

  function syncSuggest(value: string, caret: number): void {
    const element = input.current
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
    const element = input.current
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
    if (content) localStorage.setItem(DRAFT_KEY, content)
    else localStorage.removeItem(DRAFT_KEY)
  }, [content])

  function insertAtCursor(text: string): void {
    const el = input.current
    const pos = el?.selectionStart ?? content.length
    const next = content.slice(0, pos) + text + content.slice(pos)
    setContent(next)
    requestAnimationFrame(() => {
      el?.focus()
      const caret = pos + text.length
      el?.setSelectionRange(caret, caret)
      if (text.endsWith('#')) syncSuggest(next, caret)
    })
  }


  /** Wraps the selection — or drops an empty pair with the caret in the middle — like the main composer. */
  function togglePair(prefix: string, suffix = prefix): void {
    const el = input.current
    if (!el) return
    const start = el.selectionStart ?? content.length
    const end = el.selectionEnd ?? start
    const selected = content.slice(start, end)
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`
    // Empty selection: the caret belongs between the pair so the next keystroke is inside it.
    const caret = start + prefix.length + selected.length + (selected ? suffix.length : 0)
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  /** Adds or removes a block marker (`## `, `- `, `> `) at the start of the caret's line. */
  function prefixLine(prefix: string): void {
    const el = input.current
    if (!el) return
    const caret = el.selectionStart ?? content.length
    const lineStart = content.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
    const already = content.startsWith(prefix, lineStart)
    const next = already
      ? content.slice(0, lineStart) + content.slice(lineStart + prefix.length)
      : content.slice(0, lineStart) + prefix + content.slice(lineStart)
    const position = already ? Math.max(lineStart, caret - prefix.length) : caret + prefix.length
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(position, position)
    })
  }

  function insertCodeBlock(): void {
    const el = input.current
    if (!el) return
    const start = el.selectionStart ?? content.length
    const end = el.selectionEnd ?? start
    const body = content.slice(start, end)
    const before = content.slice(0, start)
    const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n'
    const fence = `${lead}\u0060\u0060\u0060\n${body}\n\u0060\u0060\u0060\n`
    setContent(before + fence + content.slice(end))
    const position = start + lead.length + 4 + body.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(position, position)
    })
  }

  function applyFormat(kind: string): void {
    const el = input.current
    switch (kind) {
      case 'bold': return togglePair('**')
      case 'italic': return togglePair('*')
      case 'strike': return togglePair('~~')
      case 'underline': return togglePair('<u>', '</u>')
      case 'heading': return prefixLine('## ')
      case 'list': return prefixLine('- ')
      case 'quote': return prefixLine('> ')
      case 'code': return togglePair('\u0060')
      case 'codeblock': return insertCodeBlock()
      case 'link': {
        if (!el) return
        const start = el.selectionStart ?? content.length
        const end = el.selectionEnd ?? start
        const label = content.slice(start, end) || '文字'
        setContent(`${content.slice(0, start)}[${label}](url)${content.slice(end)}`)
        const position = start + label.length + 3
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(position, position + 3)
        })
        return
      }
      default: return
    }
  }

  async function submit(): Promise<void> {
    const text = content.trim()
    if (!text || state === 'sending') return
    setState('sending')
    setMessage('')
    const result = await window.api.quick.capture({ content: text, visibility })
    if (result.success) {
      setContent('')
      setState('done')
      setMessage('已记录')
      window.setTimeout(() => {
        setState('idle')
        setMessage('')
        void window.api.quick.hide()
      }, 500)
    } else {
      setState('error')
      setMessage(result.error ?? '发送失败')
    }
  }

  return (
    <div className="quick-card" style={{ margin: 8 }}>
      <div className="quick-header">
        <span style={{ color: 'var(--accent)', lineHeight: 0 }}><BoltIcon size={18} /></span>
        <span className="title">快速记录</span>
        <span className="kbd">{formatAccelerator(hotkey)}</span>
        <button
          type="button"
          onClick={() => { void window.api.quick.showMain(); void window.api.quick.hide() }}
          className="ghost-btn"
          style={{ height: 26, fontSize: 11 }}
        >
          打开主界面
        </button>
      </div>

      <div className="quick-body-area">
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <textarea
            ref={input}
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
              if (e.key === 'Escape') {
                e.preventDefault()
                void window.api.quick.hide()
              } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={3}
            placeholder="刚想到什么？随手记下来…支持 Markdown 和 #标签"
          />
          {suggest && options.length > 0 && (() => {
            const { point } = suggest
            const boxWidth = 200
            const maxLeft = Math.max(4, (input.current?.clientWidth ?? boxWidth) - boxWidth)
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

      <div className="quick-footer">
        <VisibilityPicker value={visibility} onChange={setVisibility} size={15} />
        <button
          className="tool-btn plain"
          onClick={() => {
            const position = input.current?.selectionStart ?? content.length
            insertAtCursor('#')
            const element = input.current
            if (element && tags.length > 0) setSuggest({ start: position, query: '', index: 0, point: caretPoint(element, position + 1) })
          }}
          title="插入标签 #" data-tip="插入标签"
        ><span style={{ fontSize: 15, lineHeight: 1 }}>#</span></button>
        <button className="tool-btn plain" onClick={() => insertAtCursor('![]()')} title="插入图片" data-tip="插入图片"><ImageIcon size={17} /></button>
        <span className="spacer" />
        <span className={`quick-hint${state === 'error' ? ' inline-error' : ''}`}>
          {configured === false
            ? '请先在主界面登录'
            : state === 'sending' ? '发送中…' : state === 'done' ? '已记录' : state === 'error' ? message : `${visibleLength(content)} 字 · Enter 保存`}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!content.trim() || state === 'sending'}
          className="send-btn"
          title="保存笔记"
          aria-label="保存笔记"
        >
          {state === 'sending' ? <span className="send-spinner" /> : <SendIcon size={17} />}
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QuickCapture />
  </React.StrictMode>
)
