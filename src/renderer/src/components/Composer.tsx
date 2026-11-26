import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Memo, Visibility } from '@shared/types'
import { formatAccelerator } from '../lib/accelerator'
import { fileToBase64, isImage } from '../lib/files'
import { attachmentUrl, htmlToMarkdown, renderMarkdown } from '../lib/markdown'
import { caretPoint, filterTags, findTagQuery, type CaretPoint } from '../lib/tag-suggest'
import {
  CheckMarkIcon, CloseIcon, CodeBlockIcon, CodeIcon, EyeIcon, HeadingIcon, ImageIcon,
  LinkIcon, ListIcon, QuoteIcon, SendIcon
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
  /** Overrides the empty-state hint, e.g. the archive view files what you write. */
  placeholder?: string
  onSubmitted: (memo: Memo) => void
  onCancel?: () => void
}

type EditMode = 'preview' | 'source'
type MarkKind = 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'heading' | 'list' | 'quote' | 'link' | 'codeblock'

const DRAFT_KEY = 'memotrail.composer.draft'
const PLACEHOLDER = '此刻有什么想记录的？换个标签，或直接开始写…'

/** One inline image in the markdown source, with the offsets needed to cut it back out. */
interface DraftImage {
  alt: string
  url: string
  start: number
  end: number
}

const BLOCK_TAGS = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'UL', 'OL']

function isBlockEl(node: Node | null): node is HTMLElement {
  return !!node && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes((node as Element).tagName)
}

/** Tag aliases per format, so `<b>` from imported content behaves like our `<strong>`. */
const MARK_GROUPS = {
  bold: ['strong', 'b'],
  italic: ['em', 'i'],
  strike: ['s', 'del', 'strike'],
  underline: ['u', 'ins'],
  code: ['code'],
  link: ['a']
} as const

/** Characters that may sit next to a single `*` before it counts as emphasis. */
const EDGE = /[\s，。、！？；：（）()《》【】「」『』“”‘’"'.,:;!?\-—]/

function edgeOk(ch: string | undefined): boolean {
  return ch === undefined || EDGE.test(ch)
}

function tokenElement(tag: string, text: string, attributes?: Record<string, string>): HTMLElement {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes ?? {})) element.setAttribute(name, value)
  element.textContent = text
  return element
}

/** Markdown pairs the editor renders as soon as the caret leaves them. */
const TOKEN_RULES: Array<{ pattern: RegExp; strict?: boolean; build: (match: RegExpExecArray) => HTMLElement }> = [
  { pattern: /\*\*(?!\s)([^*\n]+?)\*\*/g, build: (m) => tokenElement('strong', m[1]) },
  { pattern: /~~(?!\s)([^~\n]+?)~~/g, build: (m) => tokenElement('s', m[1]) },
  { pattern: /`([^`\n]+)`/g, build: (m) => tokenElement('code', m[1]) },
  { pattern: /<u>([^<\n]+)<\/u>/g, build: (m) => tokenElement('u', m[1]) },
  {
    pattern: /\[([^\]\n]*)\]\((https?:\/\/[^)\s]*)\)/g,
    build: (m) => tokenElement('a', m[1], { href: m[2] })
  },
  { pattern: /\*([^*\n]+?)\*/g, strict: true, build: (m) => tokenElement('em', m[1]) }
]

/** Inline marks that must never bleed into whatever gets typed next. */
const INLINE_MARKS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'a']

function isMarkEl(node: Node | null): node is HTMLElement {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    INLINE_MARKS.includes((node as Element).tagName.toLowerCase())
  )
}

/**
 * Outermost inline mark wrapping `node` — `<b><u>x</u></b>` resolves to `<b>` so escaping lands
 * outside every layer at once. `root` bounds the walk to the editable surface.
 */
function outermostMark(node: Node | null, root: HTMLElement): HTMLElement | null {
  let cursor: Node | null = node
  let found: HTMLElement | null = null
  while (cursor && cursor !== root) {
    if (isMarkEl(cursor)) found = cursor
    cursor = cursor.parentNode
  }
  return found
}

function selectRange(range: Range): void {
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Images are found in source order, so the strip below the editor always mirrors what will be
 * published — posting keeps the order and removing one entry only deletes its own token.
 */
function collectImages(markdown: string): DraftImage[] {
  const out: DraftImage[] = []
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    out.push({ alt: match[1], url: match[2], start: match.index, end: match.index + match[0].length })
  }
  return out
}

export function Composer({
  memoName,
  initialContent = '',
  initialVisibility = 'PRIVATE',
  autoFocus = false,
  focusSignal = 0,
  submitLabel,
  variant = 'feed',
  tagSuggestions = [],
  placeholder = PLACEHOLDER,
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
  /** Inline mark an IME composition is about to type into, plus its text before composing. */
  const composeGuard = useRef<{ mark: HTMLElement; before: string } | null>(null)
  /** True while an IME composition is in flight; DOM clean-up must not run during one. */
  const composing = useRef(false)
  const contentRef = useRef(content)
  contentRef.current = content

  const isEditor = variant === 'editor'
  /** Preview mode shows the placeholder only while the source is genuinely empty. */
  const isEmpty = content.trim().length === 0
  const images = useMemo(() => collectImages(content), [content])
  /** Image tokens carry long attachment URLs — they must not inflate the character counter. */
  const textLength = useMemo(() => content.replace(/!\[[^\]]*\]\([^)\s]+\)/g, '').trim().length, [content])
  const [lightbox, setLightbox] = useState<DraftImage | null>(null)

  // Escape closes the enlarged view without also cancelling the whole composer.
  useEffect(() => {
    if (!lightbox) return
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setLightbox(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightbox])
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

  /**
   * Marker pairs are plain text until the caret leaves them; moving away (arrow keys, a click,
   * or blurring the surface) is the moment to render them.
   */
  useEffect(() => {
    if (mode !== 'preview') return
    const el = previewRef.current
    if (!el) return
    let frame = 0
    const run = (): void => {
      frame = 0
      const root = previewRef.current
      if (!root) return
      // Only when the work would be visible to the user: the caret is (or just was) in here.
      const selection = window.getSelection()
      const inside = !!selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer)
      if (!inside && document.activeElement !== root) return
      if (renderTypedTokens(root)) setContent(htmlToMarkdown(root.innerHTML))
    }
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(run)
    }
    document.addEventListener('selectionchange', schedule)
    el.addEventListener('blur', schedule)
    el.addEventListener('input', schedule)
    return () => {
      document.removeEventListener('selectionchange', schedule)
      el.removeEventListener('blur', schedule)
      el.removeEventListener('input', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /**
   * Native `beforeinput` (React only synthesises one from `textInput`, which cannot cancel the
   * edit). Taking over here is what keeps a character typed right after a formatted run plain.
   */
  useEffect(() => {
    const el = previewRef.current
    if (mode !== 'preview' || !el) return
    function onBeforeInput(event: Event): void {
      const native = event as InputEvent
      if (native.inputType !== 'insertText' || !native.data) return
      const root = previewRef.current
      if (!root) return
      const mark = markSwallowingNextChar(root)
      if (!mark) return
      event.preventDefault()
      insertPlainAfter(mark, native.data)
    }
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
    if (!composing.current) {
      pruneEmptyMarks(el)
      clearStrayStyles(el)
    }
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

  /** IME text cannot be cancelled, so remember the mark it would land in. */
  function beginComposition(): void {
    composing.current = true
    const root = previewRef.current
    if (!root) return
    const mark = markSwallowingNextChar(root)
    composeGuard.current = mark ? { mark, before: mark.textContent ?? '' } : null
  }

  /** After composing, peel the composed characters back out of the mark as plain text. */
  function finishComposition(): void {
    composing.current = false
    const guard = composeGuard.current
    composeGuard.current = null
    const root = previewRef.current
    if (!root || !guard || !guard.mark.isConnected) return
    const after = guard.mark.textContent ?? ''
    if (!after.startsWith(guard.before) || after.length === guard.before.length) return
    const extra = after.slice(guard.before.length)
    let remaining = extra.length
    while (remaining > 0) {
      const last = lastTextNode(guard.mark)
      if (!last) break
      const take = Math.min(remaining, last.data.length)
      last.deleteData(last.data.length - take, take)
      remaining -= take
    }
    insertPlainAfter(guard.mark, extra)
    if ((guard.mark.textContent ?? '').length === 0) {
      guard.mark.remove()
      setContent(htmlToMarkdown(root.innerHTML))
    }
  }

  function insertAtCursor(text: string): void {
    if (mode === 'preview') {
      const el = previewRef.current
      if (!el) return
      el.focus()
      // Keep the insertion out of a trailing mark, otherwise a `#` ends up underlined.
      escapeTrailingMark(el)
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

  /** Nearest ancestor carrying one of `group`'s tags, bounded by the editable surface. */
  function sameTagAncestor(node: Node | null, root: HTMLElement, group: readonly string[]): HTMLElement | null {
    let cursor: Node | null = node
    while (cursor && cursor !== root) {
      if (isMarkEl(cursor) && group.includes(cursor.tagName.toLowerCase())) return cursor
      cursor = cursor.parentNode
    }
    return null
  }

  /**
   * Parks a collapsed caret right after `node`, inside a real text node. A caret expressed as
   * "block, offset after the inline element" looks the same but Chrome resolves it *into* that
   * element when a key is pressed, which is how the format kept spreading. A text node leaves
   * no room for that guess.
   */
  function placeCaretAfterPlain(node: Node): boolean {
    const parent = node.parentNode
    if (!parent) return false
    const next = node.nextSibling
    const pad = next && next.nodeType === Node.TEXT_NODE ? next : document.createTextNode('')
    if (!pad.parentNode) parent.insertBefore(pad, next)
    const range = document.createRange()
    range.setStart(pad, 0)
    range.collapse(true)
    selectRange(range)
    return true
  }

  /**
   * The actual cure for "typing after formatted text inherits the format": with a collapsed
   * caret sitting on a mark's last character, Chrome treats the mark as the *typing style* and
   * keeps everything you type inside it. Stepping the caret past the mark first makes the next
   * character plain. Returns true when the caret had to move.
   */
  function escapeTrailingMark(root: HTMLElement | null): boolean {
    if (!root) return false
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    const { startContainer, startOffset } = range
    if (!root.contains(startContainer)) return false
    const atEnd = startContainer.nodeType === Node.TEXT_NODE
      ? startOffset === (startContainer.textContent ?? '').length
      : startOffset === startContainer.childNodes.length
    if (!atEnd) return false
    const mark = outermostMark(startContainer, root)
    if (!mark) return false
    // Leave the caret alone while the mark still has styled content after it — jumping out
    // there would drop the caret behind text the user is legitimately still inside.
    const tail = document.createRange()
    tail.setStart(range.endContainer, range.endOffset)
    tail.setEndAfter(mark)
    if (tail.toString().length > 0) return false
    return placeCaretAfterPlain(mark)
  }

  /** Releases a mark's children into its parent and parks the caret after them (plain again). */
  function unwrapMark(mark: HTMLElement): void {
    const parent = mark.parentNode
    if (!parent) return
    const last = mark.lastChild
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    if (last) placeCaretAfterPlain(last)
    else {
      const range = document.createRange()
      range.setStart(parent, parent.childNodes.length)
      range.collapse(true)
      selectRange(range)
    }
  }

  /** Nearest block container, so two carets can be compared by "same paragraph". */
  function blockOf(node: Node, root: HTMLElement): HTMLElement {
    let cursor: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    while (cursor && cursor !== root) {
      if (BLOCK_TAGS.includes(cursor.tagName)) return cursor
      cursor = cursor.parentElement
    }
    return root
  }

  /** Last text node holding real content before `caret` (whitespace-only nodes are skipped). */
  function previousTextBefore(root: HTMLElement, caret: Range): Text | null {
    const start = caret.startContainer
    if (start.nodeType === Node.TEXT_NODE && caret.startOffset > 0 && (start as Text).data.trim().length > 0) {
      return start as Text
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let previous: Text | null = null
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      const span = document.createRange()
      span.setStart(text, 0)
      span.setEnd(text, text.data.length)
      if (span.compareBoundaryPoints(Range.END_TO_START, caret) > 0) break
      if (text.data.trim().length > 0) previous = text
    }
    return previous
  }

  /**
   * Chrome resolves a collapsed caret that sits at the end of a block whose last child is an
   * inline mark *back into that mark*, then uses the mark as the typing style — which is why a
   * note keeps gaining underline/bold after a formatted word. No placeholder (empty text node,
   * empty span, invisible char) survives that resolution, so the character has to be inserted
   * by hand. Returns the mark that would swallow it, or null when typing is already safe.
   */
  function markSwallowingNextChar(root: HTMLElement): HTMLElement | null {
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null
    const caret = selection.getRangeAt(0)
    if (!root.contains(caret.startContainer)) return null
    // Only at the end of a run: anything meaningful after the caret means we are inside it.
    const rest = document.createRange()
    rest.setStart(caret.startContainer, caret.startOffset)
    rest.setEnd(root, root.childNodes.length)
    if (rest.toString().trim().length > 0) return null
    const previous = previousTextBefore(root, caret)
    if (!previous) return null
    if (blockOf(previous, root) !== blockOf(caret.startContainer, root)) return null
    return outermostMark(previous, root)
  }

  /** Types into a plain text node right after `mark`, sidestepping the browser's resolution. */
  function insertPlainAfter(mark: HTMLElement, text: string): void {
    const parent = mark.parentNode
    if (!parent) return
    const selection = window.getSelection()
    let node: Text | null = null
    let index = 0
    if (selection && selection.isCollapsed && selection.rangeCount > 0) {
      const caret = selection.getRangeAt(0)
      const holder = caret.startContainer
      // The caret may already sit in plain text that follows the mark (e.g. a typed space).
      // A caret *inside* the mark reports FOLLOWING too, so descendants must be excluded.
      const relation = mark.compareDocumentPosition(holder)
      const outside = (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
        (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0
      if (holder.nodeType === Node.TEXT_NODE && outside) {
        node = holder as Text
        index = caret.startOffset
      }
    }
    if (!node) {
      const next = mark.nextSibling
      node = next && next.nodeType === Node.TEXT_NODE ? (next as Text) : document.createTextNode('')
      if (!node.parentNode) parent.insertBefore(node, next)
      index = 0
    }
    node.insertData(index, text)
    const range = document.createRange()
    range.setStart(node, index + text.length)
    range.collapse(true)
    selectRange(range)
    const root = previewRef.current
    if (root) setContent(htmlToMarkdown(root.innerHTML))
  }

  /** Deepest trailing text node of `element`, used to peel composed characters back out. */
  function lastTextNode(element: HTMLElement): Text | null {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let last: Text | null = null
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node as Text
    return last && last.data.length > 0 ? last : null
  }

  /** Leaf block elements of the editable, so a multi-line selection can be formatted per line. */
  function leafBlocks(root: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = []
    const walk = (node: HTMLElement): void => {
      for (const child of Array.from(node.children) as HTMLElement[]) {
        if (!isBlockEl(child)) continue
        const nested = (Array.from(child.children) as HTMLElement[]).some((c) => isBlockEl(c))
        if (nested) walk(child)
        else out.push(child)
      }
    }
    walk(root)
    return out
  }

  /**
   * Enter in a contenteditable can leave bare text next to `<div>` blocks. Giving the loose run
   * its own paragraph keeps block-level splitting below predictable (and the Markdown unchanged).
   */
  function normalizeBlocks(root: HTMLElement): void {
    if (!(Array.from(root.children) as HTMLElement[]).some((child) => isBlockEl(child))) return
    const loose = (node: Node): boolean => !isBlockEl(node) && (
      node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim().length > 0
    )
    let group: Node[] = []
    const flush = (): void => {
      if (group.length === 0) return
      const paragraph = document.createElement('p')
      root.insertBefore(paragraph, group[0])
      for (const node of group) paragraph.appendChild(node)
      group = []
    }
    for (const child of Array.from(root.childNodes)) {
      if (loose(child)) group.push(child)
      else flush()
    }
    flush()
  }

  /** Wraps one (single-block) range, folding it into an existing mark of the same kind. */
  function wrapRange(root: HTMLElement, range: Range, tagName: string, group: readonly string[], attributes?: Record<string, string>): HTMLElement | null {
    const wrapper = document.createElement(tagName)
    for (const [name, value] of Object.entries(attributes ?? {})) wrapper.setAttribute(name, value)
    wrapper.appendChild(range.extractContents())
    if (!(wrapper.textContent ?? '').length && !wrapper.querySelector('img')) return null
    range.insertNode(wrapper)
    // A selection that ended mid-mark leaves a copy of that mark inside the wrapper; folding it
    // back into the outer one keeps `<u><u>…</u></u>` out of the Markdown.
    let styled: HTMLElement = wrapper
    const outer = outermostMark(wrapper.parentNode, root)
    if (outer && group.includes(outer.tagName.toLowerCase())) {
      const parent = wrapper.parentNode
      if (parent) {
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper)
        parent.removeChild(wrapper)
        styled = outer
      }
    }
    normalizeMark(root, styled, group)
    return root.contains(styled) ? styled : null
  }

  /**
   * Wraps the non-collapsed selection and puts the caret after it. Multi-line selections are
   * wrapped per paragraph — one `<strong>` around several `<p>`s would not survive the trip
   * through Markdown.
   */
  function wrapSelection(root: HTMLElement, tagName: string, group: readonly string[], attributes?: Record<string, string>): void {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    normalizeBlocks(root)
    const live = window.getSelection()
    const active = live && live.rangeCount > 0 ? live.getRangeAt(0) : range
    const blocks = leafBlocks(root).filter((block) => active.intersectsNode(block))
    const targets: Range[] = []
    if (blocks.length <= 1) {
      targets.push(active.cloneRange())
    } else {
      for (const block of blocks) {
        const part = document.createRange()
        part.selectNodeContents(block)
        if (block.contains(active.startContainer)) part.setStart(active.startContainer, active.startOffset)
        if (block.contains(active.endContainer)) part.setEnd(active.endContainer, active.endOffset)
        if (!part.collapsed) targets.push(part)
      }
    }
    let last: HTMLElement | null = null
    for (const target of targets) last = wrapRange(root, target, tagName, group, attributes) ?? last
    if (last) placeCaretAfterPlain(last)
  }

  /**
   * Re-applying a mark to part of an existing run can leave `<u><u>x</u></u>` or a stray empty
   * `<u>` where the run was split; fold those back into one element.
   */
  function normalizeMark(root: HTMLElement, wrapper: HTMLElement, group: readonly string[]): void {
    wrapper.querySelectorAll(group.join(',')).forEach((inner) => {
      while (inner.firstChild) inner.parentNode?.insertBefore(inner.firstChild, inner)
      inner.remove()
    })
    const parent = wrapper.parentNode
    if (!parent) return
    for (const sibling of Array.from(parent.querySelectorAll(group.join(',')))) {
      if (sibling !== wrapper && (sibling.textContent ?? '').length === 0) sibling.remove()
    }
    if (!root.contains(wrapper) || (wrapper.textContent ?? '').length === 0) wrapper.remove()
  }

  /**
   * Applies Markdown formatting. Source mode manipulates the text directly; preview mode wraps
   * the selection in real elements instead of leaning on `execCommand`, whose "typing style"
   * is exactly what leaked the format into text typed afterwards. Either way nothing is left
   * selected and the caret sits outside the mark.
   */
  function applyFormat(kind: MarkKind): void {
    if (mode === 'preview') {
      const el = previewRef.current
      if (!el) return
      el.focus()
      const inlineGroups: Partial<Record<MarkKind, { tag: string; group: readonly string[] }>> = {
        bold: { tag: 'strong', group: MARK_GROUPS.bold },
        italic: { tag: 'em', group: MARK_GROUPS.italic },
        strike: { tag: 's', group: MARK_GROUPS.strike },
        underline: { tag: 'u', group: MARK_GROUPS.underline },
        code: { tag: 'code', group: MARK_GROUPS.code }
      }
      const inlineTag = inlineGroups[kind]
      const selection = window.getSelection()
      const collapsed = !selection || selection.isCollapsed

      if (inlineTag) {
        const covering = selection && !collapsed
          ? sameTagAncestor(selection.getRangeAt(0).startContainer, el, inlineTag.group)
          : null
        // Re-applying to the same run means "off"; the selection may also have picked up the
        // padding text node our own caret placement leaves behind, hence the text comparison.
        const coversIt = covering && (
          covering.contains(selection!.getRangeAt(0).endContainer) ||
          selection!.toString() === (covering.textContent ?? '')
        )
        if (covering && coversIt) {
          unwrapMark(covering)
        } else if (collapsed) {
          // Nothing selected: drop the Markdown pair so the caret sits between the markers and
          // whatever is typed there renders once the caret leaves.
          insertTokenPair(el, kind)
        } else {
          wrapSelection(el, inlineTag.tag, inlineTag.group)
        }
      } else if (kind === 'link') {
        const existing = collapsed ? null : sameTagAncestor(selection!.getRangeAt(0).startContainer, el, MARK_GROUPS.link)
        if (existing) unwrapMark(existing)
        else if (collapsed) insertTokenPair(el, 'link')
        else wrapSelection(el, 'a', MARK_GROUPS.link, { href: 'https://' })
      } else if (kind === 'heading') {
        document.execCommand('formatBlock', false, 'h2')
      } else if (kind === 'quote') {
        document.execCommand('formatBlock', false, 'blockquote')
      } else if (kind === 'list') {
        document.execCommand('insertUnorderedList')
      } else if (kind === 'codeblock') {
        document.execCommand('formatBlock', false, 'pre')
      }
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

  /**
   * Deletes marks whose text is gone. Left in place they keep the caret inside and every new
   * character inherits the format, which is why an "empty" composer could still type bold.
   */
  function pruneEmptyMarks(root: HTMLElement): boolean {
    let changed = false
    const selection = window.getSelection()
    for (const mark of Array.from(root.querySelectorAll(INLINE_MARKS.join(','))) as HTMLElement[]) {
      if ((mark.textContent ?? '').length > 0 || mark.querySelector('img')) continue
      if (selection && selection.rangeCount > 0 && mark.contains(selection.getRangeAt(0).startContainer)) {
        const range = document.createRange()
        range.setStartAfter(mark)
        range.collapse(true)
        selectRange(range)
      }
      mark.remove()
      changed = true
    }
    return changed
  }

  /**
   * Deleting a formatted run leaves Chrome's "typing style" switched on even after the run is
   * gone, so an empty composer kept producing bold text. Neither clearing the DOM nor toggling
   * the command resets it — dropping and re-adding the same caret does.
   */
  function clearStrayStyles(root: HTMLElement): boolean {
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
    const caret = selection.getRangeAt(0)
    if (!root.contains(caret.startContainer)) return false
    // Inside a real mark the style belongs to the text — leave it alone.
    if (outermostMark(caret.startContainer, root)) return false
    const carried = ['bold', 'italic', 'underline', 'strikeThrough']
      .some((command) => document.queryCommandState(command))
    if (!carried) return false
    const same = caret.cloneRange()
    selection.removeAllRanges()
    selection.addRange(same)
    return true
  }

  /**
   * Turns markers the user is done with (`**x**`, `*x*`, `~~x~~`, `` `x` ``, `<u>x</u>`,
   * `[x](url)`) into real elements. A pair still holding the caret is left alone so typing
   * inside it keeps working.
   */
  function renderTypedTokens(root: HTMLElement): boolean {
    if (composing.current) return false
    const selection = window.getSelection()
    const caret = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    let changed = false
    for (let round = 0; round < 40; round += 1) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let converted = false
      for (let node = walker.nextNode(); node && !converted; node = walker.nextNode()) {
        const text = node as Text
        if (!text.data) continue
        if (text.parentElement?.closest('code, pre, a, strong, em, u, s, del')) continue
        for (const rule of TOKEN_RULES) {
          rule.pattern.lastIndex = 0
          const match = rule.pattern.exec(text.data)
          if (!match || !match[1]) continue
          const begin = match.index
          const finish = begin + match[0].length
          if (rule.strict && !(edgeOk(text.data[begin - 1]) && edgeOk(text.data[finish]))) continue
          const sameNode = !!caret && caret.startContainer === text
          const offset = sameNode ? caret!.startOffset : -1
          // Still editing between the markers — wait until the caret leaves.
          if (sameNode && offset > begin && offset < finish) continue

          const parent = text.parentNode
          if (!parent) continue
          const head = text.data.slice(0, begin)
          const tail = text.data.slice(finish)
          const headNode = head ? document.createTextNode(head) : null
          const tailNode = tail ? document.createTextNode(tail) : null
          const element = rule.build(match)
          const fragment = document.createDocumentFragment()
          if (headNode) fragment.appendChild(headNode)
          fragment.appendChild(element)
          if (tailNode) fragment.appendChild(tailNode)
          parent.replaceChild(fragment, text)

          if (sameNode && offset >= 0) {
            const target = offset <= begin ? headNode : tailNode
            if (target) {
              const range = document.createRange()
              range.setStart(target, offset <= begin ? offset : offset - finish)
              range.collapse(true)
              selectRange(range)
            } else {
              const range = document.createRange()
              range.setStartAfter(element)
              range.collapse(true)
              selectRange(range)
            }
          }
          changed = true
          converted = true
          break
        }
      }
      if (!converted) break
    }
    return changed
  }

  /** Inserts an empty marker pair with the caret between it, Typora style. */
  function insertTokenPair(root: HTMLElement, kind: MarkKind): void {
    const pairs: Partial<Record<MarkKind, [string, string]>> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      strike: ['~~', '~~'],
      underline: ['<u>', '</u>'],
      code: ['`', '`']
    }
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const pair = pairs[kind]
    const token = kind === 'link' ? '[](https://)' : pair ? `${pair[0]}${pair[1]}` : ''
    if (!token) return
    const node = document.createTextNode(token)
    range.deleteContents()
    range.insertNode(node)
    // Link text goes between the brackets, the rest between the two markers.
    const caret = document.createRange()
    caret.setStart(node, kind === 'link' ? 1 : pair![0].length)
    caret.collapse(true)
    selectRange(caret)
    setContent(htmlToMarkdown(root.innerHTML))
  }

  /** Removes the empty lines a soft break left at the very end of a block. */
  function trimEmptyTail(node: Node): void {
    let last = node.lastChild
    while (last) {
      if (last.nodeName === 'BR' || (last.nodeType === Node.TEXT_NODE && !(last.textContent ?? ''))) {
        last.remove()
        last = node.lastChild
        continue
      }
      if (last.nodeType === Node.ELEMENT_NODE) {
        const element = last as HTMLElement
        if (element.querySelector('img')) break
        trimEmptyTail(element)
        if (!element.firstChild) {
          element.remove()
          last = node.lastChild
          continue
        }
      }
      break
    }
  }

  /**
   * Enter inside a quote keeps both lines in the same `>` block; a second Enter on the empty
   * line leaves the quote and continues as ordinary text.
   */
  function handleQuoteEnter(event: React.KeyboardEvent<HTMLDivElement>): boolean {
    const root = previewRef.current
    const selection = window.getSelection()
    if (!root || !selection || !selection.isCollapsed || selection.rangeCount === 0) return false
    const caret = selection.getRangeAt(0)
    const anchor = caret.startContainer
    const host = (anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor.parentElement)
      ?.closest('blockquote')
    if (!host || !root.contains(host)) return false

    const before = document.createRange()
    before.selectNodeContents(host)
    before.setEnd(caret.startContainer, caret.startOffset)
    const holder = document.createElement('div')
    holder.appendChild(before.cloneContents())
    const lines = holder.innerHTML.split(/<br\s*\/?>/i)
    const lineText = (lines[lines.length - 1] ?? '').replace(/<[^>]*>/g, '').trim()

    event.preventDefault()
    if (lineText) {
      const br = document.createElement('br')
      caret.deleteContents()
      caret.insertNode(br)
      const next = document.createRange()
      next.setStartAfter(br)
      next.collapse(true)
      selectRange(next)
    } else {
      // Empty line: continue in a plain paragraph after the quote, and take the now-empty
      // break back out of it so the quote keeps only the lines that have content.
      const paragraph = document.createElement('p')
      paragraph.appendChild(document.createElement('br'))
      host.after(paragraph)
      trimEmptyTail(host)
      const next = document.createRange()
      next.setStart(paragraph, 0)
      next.collapse(true)
      selectRange(next)
    }
    setContent(htmlToMarkdown(root.innerHTML))
    return true
  }

  /** Cuts exactly one image token out of the source, leaving every other image in place. */
  function removeImage(target: DraftImage): void {
    const source = contentRef.current
    const next = `${source.slice(0, target.start)}${source.slice(target.end)}`
      .replace(/[ \t]\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, '')
    contentRef.current = next
    setContent(next)
    if (mode === 'preview') paintPreview(next)
    setLightbox((current) => (current && current.start === target.start ? null : current))
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
    // Anything still wrapped in raw markers is finished now — render it before saving.
    const surface = previewRef.current
    if (mode === 'preview' && surface && renderTypedTokens(surface)) {
      setContent(htmlToMarkdown(surface.innerHTML))
    }
    const text = (mode === 'preview' && surface ? htmlToMarkdown(surface.innerHTML) : content).trim()
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
            // Typing at the end of a formatted run would otherwise stay inside it; the native
            // beforeinput listener above inserts those characters, IME text is lifted on end.
            onCompositionStart={beginComposition}
            onCompositionEnd={finishComposition}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && handleQuoteEnter(e)) return
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
            placeholder={placeholder}
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
            {placeholder}
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

      {(images.length > 0 || uploading) && (
        <div className="composer-attachments" aria-label="图片附件">
          {images.map((image, index) => (
            <div className="attachment" key={`${image.start}-${image.url}`}>
              <button
                type="button"
                className="attachment-open"
                onClick={() => setLightbox(image)}
                title="查看大图"
                aria-label={`查看第 ${index + 1} 张图片`}
              >
                <img src={attachmentUrl(image.url)} alt={image.alt || `图片 ${index + 1}`} />
              </button>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeImage(image)}
                title="删除图片"
                aria-label={`删除第 ${index + 1} 张图片`}
              >
                <CloseIcon size={11} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="attachment attachment-uploading" aria-label="图片上传中">
              <span className="send-spinner" />
            </div>
          )}
        </div>
      )}

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
        <span className="quick-hint">
          {error ? '' : `${textLength} 字`} · {formatAccelerator('CommandOrControl+Enter')} {memoName ? '保存' : '发送'}
        </span>
        {onCancel && (
          <button className="ghost-btn" onClick={onCancel}>取消</button>
        )}
        <button
          className="send-btn"
          onClick={() => void submit()}
          disabled={busy || !content.trim()}
          title={submitLabel ?? (memoName ? '保存修改' : '发送')}
          aria-label={submitLabel ?? (memoName ? '保存修改' : '发送')}
          aria-busy={busy}
        >
          {busy ? <span className="send-spinner" /> : memoName ? <CheckMarkIcon size={17} /> : <SendIcon size={17} />}
        </button>
      </div>

      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setLightbox(null)}>
          <img
            src={attachmentUrl(lightbox.url)}
            alt={lightbox.alt || '图片'}
            onClick={(event) => event.stopPropagation()}
          />
          <button className="lightbox-close" onClick={() => setLightbox(null)} title="关闭" aria-label="关闭">
            <CloseIcon size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
