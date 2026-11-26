import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

/**
 * Memos stores Markdown; render it, then strip anything dangerous before it reaches the DOM.
 * Server-relative attachment URLs (`/file/...`) are rewritten onto the private `memotrail://`
 * scheme so images load with the Bearer token attached by the main process.
 */
export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  return clean.replace(/(<img[^>]+src=")\/file\//g, '$1memotrail://local/file/')
}

/** "刚刚 / 5 分钟前 / 昨天 14:20 / 3 月 2 日" — compact, good enough for a timeline. */
export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  if (diff < 48 * 60 * minute) return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('zh-CN', sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' })
}
