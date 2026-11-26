import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BoltIcon, ImageIcon, LinkIcon, TagIcon } from './components/Icons'

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
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    input.current?.focus()
    void (async () => {
      const config = await window.api.config.get()
      setConfigured(Boolean(config?.serverUrl))
      const status = await window.api.auth.status()
      if (status.success && status.data) {
        const preferred = status.data?.defaultVisibility as Visibility | undefined
        if (preferred && preferred in VISIBILITY_LABEL) setVisibility(preferred)
      }
    })()
  }, [])

  useEffect(() => {
    if (content) localStorage.setItem(DRAFT_KEY, content)
    else localStorage.removeItem(DRAFT_KEY)
  }, [content])

  function insertAtCursor(text: string): void {
    const el = input.current
    const pos = el?.selectionStart ?? content.length
    setContent((cur) => cur.slice(0, pos) + text + cur.slice(pos))
    requestAnimationFrame(() => {
      el?.focus()
      const next = pos + text.length
      el?.setSelectionRange(next, next)
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
        <span className="kbd">Ctrl/⌘+Shift+Space</span>
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
        <textarea
          ref={input}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
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
      </div>

      <div className="quick-footer">
        <button className="tool-btn" onClick={() => insertAtCursor('#')} title="插入标签"><TagIcon size={13} /><span>标签</span></button>
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
