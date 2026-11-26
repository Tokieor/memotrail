import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function QuickCapture(): JSX.Element {
  const [content, setContent] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  async function submit(): Promise<void> {
    const text = content.trim()
    if (!text || state === 'sending') return
    setState('sending')
    const result = await window.api.quick.capture({ content: text })
    if (result.success) {
      setContent('')
      setState('done')
      setMessage('已记录')
      window.setTimeout(() => {
        setState('idle')
        setMessage('')
        void window.api.quick.hide()
      }, 600)
    } else {
      setState('error')
      setMessage(result.error ?? '发送失败')
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-2xl p-4 shadow-2xl"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
    >
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
        placeholder="记点什么…  Enter 保存，Esc 关闭"
        className="w-full resize-none bg-transparent text-[15px] outline-none"
      />
      <div className="flex items-center justify-between text-xs" style={{ color: state === 'error' ? '#d33' : 'var(--text-soft)' }}>
        <span>{message || 'Enter 保存 · Shift+Enter 换行'}</span>
        <span>{state === 'sending' ? '发送中…' : ''}</span>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QuickCapture />
  </React.StrictMode>
)
