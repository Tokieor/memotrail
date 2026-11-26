import DOMPurify from 'dompurify'
import { marked } from 'marked'
import TurndownService from 'turndown'

marked.setOptions({ gfm: true, breaks: true })

/** Reverse converter for the WYSIWYG editor: HTML in the contenteditable → Markdown source. */
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  br: '\n'
})

// Memos/marked keeps <u> as inline HTML; turndown has no default rule, so preserve it.
turndown.addRule('underline', {
  filter: ['u', 'ins'],
  replacement: (content) => `<u>${content}</u>`
})

// marked renders a single newline as <br> (breaks:true); keep the round trip stable.
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '\n'
})

export function htmlToMarkdown(html: string): string {
  // The private attachment scheme is only for rendering; store the original /file/ path.
  return turndown.turndown(html).replace(/\]\(memotrail:\/\/local\/file\//g, '](/file/')
}

/**
 * Memos stores Markdown; render it, then strip anything dangerous before it reaches the DOM.
 * Server-relative attachment URLs (`/file/...`) are rewritten onto the private `memotrail://`
 * scheme so images load with the Bearer token attached by the main process.
 */
const TAG_PATTERN = /#([\p{L}\p{N}_\-/]+)/gu

/** Wraps `#tag` occurrences in body text so tags read inline instead of in a separate chip row. */
function wrapInlineTags(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const parent = text.parentElement
    if (!parent || parent.closest('code, pre, a')) continue
    TAG_PATTERN.lastIndex = 0
    if (TAG_PATTERN.test(text.data)) targets.push(text)
  }
  for (const text of targets) {
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (const match of text.data.matchAll(TAG_PATTERN)) {
      const index = match.index ?? 0
      if (index > cursor) fragment.append(text.data.slice(cursor, index))
      const span = document.createElement('span')
      span.className = 'md-tag'
      span.dataset['tag'] = match[1]
      span.textContent = match[0]
      fragment.append(span)
      cursor = index + match[0].length
    }
    if (cursor < text.data.length) fragment.append(text.data.slice(cursor))
    text.replaceWith(fragment)
  }
}

export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  wrapInlineTags(doc.body)
  return doc.body.innerHTML.replace(/(<img[^>]+src=")\/file\//g, '$1memotrail://local/file/')
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
