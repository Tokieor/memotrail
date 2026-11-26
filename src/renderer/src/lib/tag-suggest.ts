/** Shared helpers for the `#tag` autocomplete used by both the composer and the quick-capture window. */

export interface TagQuery {
  /** Index of the `#` in the textarea value. */
  start: number
  /** Text typed after `#` so far. */
  query: string
}

export interface CaretPoint {
  left: number
  top: number
  lineHeight: number
  height: number
}

/** Returns the `#` fragment right before the caret, or null when the caret is elsewhere. */
export function findTagQuery(value: string, caret: number): TagQuery | null {
  const match = value.slice(0, caret).match(/(?:^|\s)#([\p{L}\p{N}_\-\/]*)$/u)
  if (!match) return null
  return { start: caret - match[1].length - 1, query: match[1] }
}

/** Exact matches first, then substring matches; capped so the menu stays short. */
export function filterTags(tags: string[], query: string, limit = 8): string[] {
  const needle = query.toLowerCase()
  return tags
    .filter((tag) => tag.toLowerCase().includes(needle))
    .sort((a, b) => Number(a.toLowerCase() !== needle) - Number(b.toLowerCase() !== needle))
    .slice(0, limit)
}

const MIRRORED_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'textIndent', 'tabSize'
] as const

/**
 * Measures where a caret sits inside a textarea by rendering an invisible copy of its text.
 * Needed because textareas expose no caret coordinates.
 */
export function caretPoint(element: HTMLTextAreaElement, position: number): CaretPoint {
  const style = window.getComputedStyle(element)
  const mirror = document.createElement('div')
  for (const property of MIRRORED_STYLES) mirror.style[property] = style.getPropertyValue(property)
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '0'
  mirror.style.width = `${element.clientWidth}px`
  mirror.style.height = 'auto'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.overflow = 'hidden'
  mirror.textContent = element.value.slice(0, position)

  const marker = document.createElement('span')
  marker.textContent = element.value.slice(position) || '.'
  mirror.appendChild(marker)
  element.parentElement?.appendChild(mirror)

  const left = marker.offsetLeft - element.scrollLeft
  const top = marker.offsetTop - element.scrollTop
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5
  mirror.remove()

  return { left, top, lineHeight, height: element.clientHeight }
}
