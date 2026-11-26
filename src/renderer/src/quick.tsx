import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BoltIcon, ImageIcon, LinkIcon } from './components/Icons'
import { formatAccelerator } from './lib/accelerator'
import { applyCachedTheme, applyTheme, watchSystemAppearance } from './lib/theme'
import { caretPoint, filterTags, findTagQuery, type CaretPoint } from './lib/tag-suggest'

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
      const result = await window.api.memos.list({ pageSize: 30 })
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

      <div className="quick-footer">
        <button
          className="tool-btn"
          onClick={() => {
            const position = input.current?.selectionStart ?? content.length
            insertAtCursor('#')
            const element = input.current
            if (element && tags.length > 0) setSuggest({ start: position, query: '', index: 0, point: caretPoint(element, position + 1) })
          }}
          title="插入标签 #"
        ><span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>#</span></button>
        <button className="tool-btn plain" onClick={() => insertAtCursor('![]()')} title="插入图片"><ImageIcon size={16} /></button>
        <button className="tool-btn plain" onClick={() => insertAtCursor('[]()')} title="插入链接"><LinkIcon size={16} /></button>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="visibility-select"
          title="可见范围"
        >
          {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((key) => (
            <option key={key} value={key}>{VISIBILITY_LABEL[key]}</option>
          ))}
        </select>
        <span className="spacer" />
        <span className={`quick-hint${state === 'error' ? ' inline-error' : ''}`}>
          {configured === false
            ? '请先在主界面登录'
            : state === 'sending' ? '发送中…' : state === 'done' ? '已记录' : state === 'error' ? message : 'Enter 保存 · Esc 关闭'}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!content.trim() || state === 'sending'}
          className="primary-btn"
        >
          保存笔记
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
