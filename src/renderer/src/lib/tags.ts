import type { Memo, TagColorKey, TagMetaMap } from '@shared/types'

/** How the sidebar orders the tag list. */
export type TagSort = 'all' | 'frequent' | 'recent' | 'pinned'

export const TAG_SORT_OPTIONS: { key: TagSort; label: string; hint: string }[] = [
  { key: 'all', label: '全部标签', hint: '按名称排列' },
  { key: 'frequent', label: '常用', hint: '按笔记数排列' },
  { key: 'recent', label: '最近', hint: '按最近使用排列' },
  { key: 'pinned', label: '置顶', hint: '只看置顶标签' }
]

export const TAG_COLORS: { key: TagColorKey; label: string }[] = [
  { key: 'tone-1', label: '绿' },
  { key: 'tone-2', label: '橙' },
  { key: 'tone-3', label: '蓝' },
  { key: 'tone-4', label: '粉' }
]

/** Resolves a stored colour key into the CSS variable the theme defines. */
export function tagColorVar(key?: TagColorKey): string | undefined {
  return key ? `var(--${key})` : undefined
}

/**
 * A tag without a custom colour still needs a stable one: hashing the name keeps the dot from
 * changing colour every time the sort order changes.
 */
export function defaultTagColor(name: string): TagColorKey {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return TAG_COLORS[hash % TAG_COLORS.length].key
}

export interface TagStat {
  name: string
  count: number
  /** Timestamp of the newest note carrying the tag. */
  lastUsed: number
  pinned: boolean
  color?: TagColorKey
}

/** Tags are whatever the loaded notes carry; counts and recency come from the same set. */
export function collectTagStats(memos: Memo[]): TagStat[] {
  const map = new Map<string, TagStat>()
  for (const memo of memos) {
    const stamp = Date.parse(memo.createTime ?? memo.updateTime ?? '') || 0
    for (const name of memo.tags ?? []) {
      const current = map.get(name)
      if (current) {
        current.count += 1
        current.lastUsed = Math.max(current.lastUsed, stamp)
      } else {
        map.set(name, { name, count: 1, lastUsed: stamp, pinned: false })
      }
    }
  }
  return [...map.values()]
}

/**
 * Applies the chosen order. Pinned tags always float to the top so the pin action has an
 * immediate effect in every mode; `pinned` additionally filters the list down to them.
 */
export function sortTags(stats: TagStat[], meta: TagMetaMap, sort: TagSort): TagStat[] {
  const enriched = stats.map((stat) => {
    const entry = meta[stat.name]
    return { ...stat, pinned: entry?.pinned === true, color: entry?.color }
  })
  const list = sort === 'pinned' ? enriched.filter((stat) => stat.pinned) : enriched
  const byName = (a: TagStat, b: TagStat): number => a.name.localeCompare(b.name, 'zh')
  const compare =
    sort === 'frequent'
      ? (a: TagStat, b: TagStat): number => b.count - a.count || byName(a, b)
      : sort === 'recent'
        ? (a: TagStat, b: TagStat): number => b.lastUsed - a.lastUsed || byName(a, b)
        : byName
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare(a, b))
}

/** Characters that may continue a tag, so `#work` never eats into `#work/log`. */
const TAG_TAIL = 'A-Za-z0-9_\\u4e00-\\u9fa5\\-/'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes `#tag` from a note body while leaving every other character alone: the space that
 * separated it goes with it, and a line that only held the tag loses its leading blank.
 */
export function stripTagToken(content: string, tag: string): string {
  if (!tag) return content
  const pattern = new RegExp(`[ \\t]*#${escapeRegExp(tag)}(?![${TAG_TAIL}])`, 'g')
  return content
    .replace(pattern, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Rewrites `#from` into `#to` (used when a tag is renamed so notes follow along). */
export function renameTagToken(content: string, from: string, to: string): string {
  if (!from || !to || from === to) return content
  const pattern = new RegExp(`#${escapeRegExp(from)}(?![${TAG_TAIL}])`, 'g')
  return content.replace(pattern, `#${to}`)
}

/** True when the note body still references the tag, regardless of the server's tag index. */
export function memoHasTag(memo: Memo, tag: string): boolean {
  if (memo.tags?.includes(tag)) return true
  const pattern = new RegExp(`#${escapeRegExp(tag)}(?![${TAG_TAIL}])`)
  return pattern.test(memo.content)
}
