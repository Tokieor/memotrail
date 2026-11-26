const FENCE = /^[ \t]*```[^\n]*$/gm
const IMAGE = /!\[[^\]]*\]\([^)\s]*\)/g
const LINK = /\[([^\]]*)\]\([^)\s]*\)/g
const INLINE_CODE = /`([^`]*)`/g
const BLOCK_MARK = /^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm
const EMPHASIS = /(\*\*\*|\*\*|\*|___|__|_|~~)/g
const TAG_HASH = /#(?=[\p{L}\p{N}_\-\/])/gu
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g

/**
 * Characters a reader actually sees: markdown syntax (`**`, `#`, fences, image URLs) does not count,
 * the text inside a link does, and neither do spaces.
 */
export function visibleLength(markdown: string): number {
  const text = markdown
    .replace(FENCE, '')
    .replace(IMAGE, '')
    .replace(LINK, '$1')
    .replace(INLINE_CODE, '$1')
    .replace(BLOCK_MARK, '')
    .replace(EMPHASIS, '')
    .replace(TAG_HASH, '')
    .replace(HTML_TAG, '')
  return text.replace(/\s+/g, '').length
}
