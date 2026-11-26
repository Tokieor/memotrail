import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

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

  const hint =
    configured === false
      ? '还没有配置服务器，点右上角「打开 MemoTrail」完成登录'
      : state === 'sending'
        ? '发送中…'
        : state === 'error'
          ? message
          : state === 'done'
            ? '已记录 ✓'
            : 'Enter 保存 · Shift+Enter 换行 · Esc 关闭'

  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-2xl p-4 shadow-2xl"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide" style={{ color: 'var(--text-soft)' }}>
          MEMOTRAIL · 快速记录
        </span>
        <button
          type="button"
          onClick={() => {
            void window.api.quick.showMain()
            void window.api.quick.hide()
          }}
          className="rounded-md px-2 py-0.5 text-[11px]"
          style={{ color: 'var(--text-soft)' }}
        >
          打开 MemoTrail
        </button>
      </div>

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
        placeholder="记点什么…支持 Markdown 和 #标签"
        className="w-full flex-1 resize-none bg-transparent text-[15px] outline-none"
      />

      <div className="flex items-center justify-between gap-2 text-xs" style={{ color: state === 'error' ? '#d33' : 'var(--text-soft)' }}>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="rounded-md px-1 py-0.5 text-[11px]"
          style={{ background: 'var(--bg-soft, transparent)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((key) => (
            <option key={key} value={key}>
              {VISIBILITY_LABEL[key]}
            </option>
          ))}
        </select>
        <span className="flex-1 truncate">{hint}</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!content.trim() || state === 'sending'}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          记下
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
