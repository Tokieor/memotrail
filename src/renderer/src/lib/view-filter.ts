/**
 * 图形化条件 → Memos 0.31.0 的 CEL 筛选表达式。
 *
 * 这一层只负责「拼字符串」：表达式由服务端在 ListMemos / 视图保存时编译校验，
 * 客户端不需要（也不应该）自己实现 CEL 解释器。字段与操作符覆盖官方 Views
 * 文档中列出的全部常用写法，见 web/src/pages/MemoViews.tsx 的 filterFields。
 */

export type CombineMode = 'and' | 'or'

export type FieldId =
  | 'content'
  | 'visibility'
  | 'pinned'
  | 'space'
  | 'tagsAny'
  | 'tagsNotAny'
  | 'tagsPrefix'
  | 'tagsAllSuffix'
  | 'tagsOnePrefix'
  | 'tagsIntersect'
  | 'tagsExactly'
  | 'tagsCount'
  | 'hasTask'
  | 'hasIncomplete'
  | 'hasLink'
  | 'hasCode'
  | 'hasLocation'
  | 'contentLength'
  | 'createdRecent'
  | 'createdYear'
  | 'createdMonth'
  | 'createdWeekday'
  | 'updatedRecent'
  | 'raw'

export interface ViewCondition {
  /** 本地 React key，与服务端无关。 */
  id: string
  field: FieldId
  op: string
  value: string
  /** 取反：!(expr)。 */
  negate: boolean
}

export interface ViewRules {
  combine: CombineMode
  conditions: ViewCondition[]
}

type ValueKind = 'text' | 'number' | 'enum' | 'tags' | 'none' | 'regex'

interface OperatorDef {
  id: string
  label: string
  kind: ValueKind
  placeholder?: string
  options?: { value: string; label: string }[]
}

interface FieldDef {
  label: string
  group: string
  operators: OperatorDef[]
}

const YES_NO: OperatorDef[] = [
  { id: 'yes', label: '成立', kind: 'none' },
  { id: 'no', label: '不成立', kind: 'none' }
]

const NUMBER_OPS: OperatorDef[] = [
  { id: 'eq', label: '等于', kind: 'number' },
  { id: 'gt', label: '大于', kind: 'number' },
  { id: 'lt', label: '小于', kind: 'number' },
  { id: 'ge', label: '至少', kind: 'number' },
  { id: 'le', label: '至多', kind: 'number' }
]

export const FIELD_DEFS: Record<FieldId, FieldDef> = {
  content: {
    label: '正文内容', group: '内容',
    operators: [
      { id: 'contains', label: '包含', kind: 'text', placeholder: '例如 TODO' },
      { id: 'startsWith', label: '开头是', kind: 'text' },
      { id: 'endsWith', label: '结尾是', kind: 'text' },
      { id: 'matches', label: '正则匹配', kind: 'regex', placeholder: '例如 v[0-9]+' }
    ]
  },
  visibility: {
    label: '可见性', group: '内容',
    operators: [{
      id: 'eq', label: '等于', kind: 'enum',
      options: [
        { value: 'PRIVATE', label: '私密' },
        { value: 'PROTECTED', label: '受保护' },
        { value: 'PUBLIC', label: '公开' },
        { value: 'SPACE', label: '空间' }
      ]
    }, {
      id: 'ne', label: '不等于', kind: 'enum',
      options: [
        { value: 'PRIVATE', label: '私密' },
        { value: 'PROTECTED', label: '受保护' },
        { value: 'PUBLIC', label: '公开' },
        { value: 'SPACE', label: '空间' }
      ]
    }]
  },
  pinned: { label: '是否置顶', group: '内容', operators: YES_NO },
  space: {
    label: '所属空间', group: '内容',
    operators: [
      { id: 'null', label: '不属于任何空间', kind: 'none' },
      { id: 'notNull', label: '已分配空间', kind: 'none' },
      { id: 'eq', label: '空间 ID 是', kind: 'text', placeholder: 'spaces/xxx' }
    ]
  },
  tagsAny: {
    label: '包含标签', group: '标签',
    operators: [{ id: 'in', label: '任一标签', kind: 'tags', placeholder: 'work, urgent' }]
  },
  tagsNotAny: {
    label: '不含标签', group: '标签',
    operators: [{ id: 'notIn', label: '没有这些标签', kind: 'tags', placeholder: 'work, urgent' }]
  },
  tagsPrefix: {
    label: '标签前缀', group: '标签',
    operators: [{ id: 'starts', label: '存在以此开头的标签', kind: 'text', placeholder: 'archive/' }]
  },
  tagsAllSuffix: {
    label: '全部标签后缀', group: '标签',
    operators: [{ id: 'ends', label: '所有标签都以此结尾', kind: 'text', placeholder: '-done' }]
  },
  tagsOnePrefix: {
    label: '恰好一个标签匹配', group: '标签',
    operators: [{ id: 'starts', label: '前缀是', kind: 'text', placeholder: 'project/' }]
  },
  tagsIntersect: {
    label: '标签交集', group: '标签',
    operators: [{ id: 'intersects', label: '与这些标签有交集', kind: 'tags', placeholder: 'work, urgent' }]
  },
  tagsExactly: {
    label: '标签完全相同', group: '标签',
    operators: [{ id: 'equivalent', label: '恰好是这些标签', kind: 'tags', placeholder: 'inbox' }]
  },
  tagsCount: { label: '标签数量', group: '标签', operators: NUMBER_OPS },
  hasTask: { label: '含任务清单', group: '属性', operators: YES_NO },
  hasIncomplete: { label: '有未完成待办', group: '属性', operators: YES_NO },
  hasLink: { label: '含链接', group: '属性', operators: YES_NO },
  hasCode: { label: '含代码块', group: '属性', operators: YES_NO },
  hasLocation: { label: '含位置', group: '属性', operators: YES_NO },
  contentLength: { label: '正文长度', group: '属性', operators: NUMBER_OPS },
  createdRecent: {
    label: '创建于最近', group: '时间',
    operators: [
      { id: 'h', label: '小时内', kind: 'number' },
      { id: 'd', label: '天内', kind: 'number' }
    ]
  },
  createdYear: {
    label: '创建年份', group: '时间',
    operators: [{ id: 'eq', label: '等于', kind: 'number', placeholder: '2026' }]
  },
  createdMonth: {
    label: '创建月份', group: '时间',
    operators: [{
      id: 'eq', label: '等于', kind: 'enum',
      options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((n) => ({
        value: String(Number(n) - 1), label: `${n} 月`
      }))
    }]
  },
  createdWeekday: {
    label: '创建星期', group: '时间',
    operators: [{
      id: 'eq', label: '等于', kind: 'enum',
      options: ['日', '一', '二', '三', '四', '五', '六'].map((label, index) => ({
        value: String(index), label: `周${label}`
      }))
    }]
  },
  updatedRecent: {
    label: '更新于最近', group: '时间',
    operators: [
      { id: 'h', label: '小时内', kind: 'number' },
      { id: 'd', label: '天内', kind: 'number' }
    ]
  },
  raw: {
    label: '表达式（高级）', group: '高级',
    operators: [{ id: 'raw', label: '原文', kind: 'text', placeholder: 'created_ts.getFullYear() == 2026' }]
  }
}

const FIELD_GROUPS = ['内容', '标签', '属性', '时间', '高级']

export function fieldOptions(): { group: string; fields: { id: FieldId; label: string }[] }[] {
  return FIELD_GROUPS.map((group) => ({
    group,
    fields: (Object.keys(FIELD_DEFS) as FieldId[])
      .filter((id) => FIELD_DEFS[id].group === group)
      .map((id) => ({ id, label: FIELD_DEFS[id].label }))
  }))
}

/** 默认新条件：正文包含，用户一打开就能直接打字。 */
export function newCondition(): ViewCondition {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, field: 'content', op: 'contains', value: '', negate: false }
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function tagList(value: string): string {
  const names = value.split(/[,，]/).map((item) => item.trim().replace(/^#/, '')).filter(Boolean)
  return `[${names.map(quote).join(', ')}]`
}

function numericOp(op: string, expr: string, value: string): string {
  const symbol = op === 'gt' ? '>' : op === 'lt' ? '<' : op === 'ge' ? '>=' : op === 'le' ? '<=' : '=='
  return `${expr} ${symbol} ${Number(value) || 0}`
}

function compileOne(condition: ViewCondition): string {
  const { field, op, value } = condition
  switch (field) {
    case 'content':
      return `content.${op}(${quote(value)})`
    case 'visibility':
      return `visibility ${op === 'ne' ? '!=' : '=='} ${quote(value || 'PRIVATE')}`
    case 'pinned':
      return op === 'no' ? '!pinned' : 'pinned'
    case 'space':
      return op === 'null' ? 'space == null' : op === 'notNull' ? 'space != null' : `space == ${quote(value)}`
    case 'tagsAny':
      return `tag in ${tagList(value)}`
    case 'tagsNotAny':
      return `!(tag in ${tagList(value)})`
    case 'tagsPrefix':
      return `tags.exists(t, t.startsWith(${quote(value)}))`
    case 'tagsAllSuffix':
      return `tags.all(t, t.endsWith(${quote(value)}))`
    case 'tagsOnePrefix':
      return `tags.exists_one(t, t.startsWith(${quote(value)}))`
    case 'tagsIntersect':
      return `sets.intersects(tags, ${tagList(value)})`
    case 'tagsExactly':
      return `sets.equivalent(tags, ${tagList(value)})`
    case 'tagsCount':
      return numericOp(op, 'size(tags)', value)
    case 'contentLength':
      return numericOp(op, 'size(content)', value)
    case 'hasTask':
      return op === 'no' ? '!has_task_list' : 'has_task_list'
    case 'hasIncomplete':
      return op === 'no' ? '!has_incomplete_tasks' : 'has_incomplete_tasks'
    case 'hasLink':
      return op === 'no' ? '!has_link' : 'has_link'
    case 'hasCode':
      return op === 'no' ? '!has_code' : 'has_code'
    case 'hasLocation':
      return op === 'no' ? '!has_location' : 'has_location'
    case 'createdRecent':
      return `created_ts >= now - duration(${quote(`${value || 24}${op === 'd' ? 'd' : 'h'}`)})`
    case 'updatedRecent':
      return `updated_ts >= now - duration(${quote(`${value || 24}${op === 'd' ? 'd' : 'h'}`)})`
    case 'createdYear':
      return `created_ts.getFullYear() == ${Number(value) || 2026}`
    case 'createdMonth':
      return `created_ts.getMonth() == ${Number(value) || 0}`
    case 'createdWeekday':
      return `created_ts.getDayOfWeek() == ${Number(value) || 0}`
    case 'raw':
      return value.trim()
    default:
      return ''
  }
}

/** 有值才算一条条件；纯数字 0 是合法值，不能用 truthy 判断。 */
function needsValue(field: FieldId, op: string): boolean {
  if (field === 'raw') return true
  return FIELD_DEFS[field].operators.find((item) => item.id === op)?.kind !== 'none'
}

export function buildViewExpression(rules: ViewRules): string {
  const parts = rules.conditions
    .filter((condition) => !needsValue(condition.field, condition.op) || condition.value.trim() !== '')
    .map((condition) => {
      const expr = compileOne(condition)
      return expr ? (condition.negate ? `!(${expr})` : expr) : ''
    })
    .filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const joiner = rules.combine === 'or' ? ' || ' : ' && '
  return parts.map((part) => `(${part})`).join(joiner)
}

/** 方便从官方示例一键填入图形化条件。 */
export const VIEW_EXAMPLES: { title: string; rules: ViewRules }[] = [
  { title: '置顶笔记', rules: { combine: 'and', conditions: [{ id: 'ex-pin', field: 'pinned', op: 'yes', value: '', negate: false }] } },
  {
    title: '最近 24 小时',
    rules: { combine: 'and', conditions: [{ id: 'ex-recent', field: 'createdRecent', op: 'h', value: '24', negate: false }] }
  },
  {
    title: '公开笔记',
    rules: { combine: 'and', conditions: [{ id: 'ex-public', field: 'visibility', op: 'eq', value: 'PUBLIC', negate: false }] }
  },
  {
    title: '工作或紧急标签',
    rules: { combine: 'and', conditions: [{ id: 'ex-tags', field: 'tagsAny', op: 'in', value: 'work, urgent', negate: false }] }
  },
  {
    title: '无标签',
    rules: { combine: 'and', conditions: [{ id: 'ex-untagged', field: 'tagsCount', op: 'eq', value: '0', negate: false }] }
  },
  {
    title: '未完成待办',
    rules: { combine: 'and', conditions: [{ id: 'ex-todo', field: 'hasIncomplete', op: 'yes', value: '', negate: false }] }
  },
  {
    title: '含链接或代码',
    rules: {
      combine: 'or',
      conditions: [
        { id: 'ex-link', field: 'hasLink', op: 'yes', value: '', negate: false },
        { id: 'ex-code', field: 'hasCode', op: 'yes', value: '', negate: false }
      ]
    }
  },
  {
    title: '长笔记（> 280 字）',
    rules: { combine: 'and', conditions: [{ id: 'ex-long', field: 'contentLength', op: 'gt', value: '280', negate: false }] }
  }
]

// 图形结构存在本地：服务端的 View 只存表达式，重新打开时要还原下拉框就得留一份。
const RULES_KEY = 'memotrail.viewRules.v1'

interface StoredRules {
  [name: string]: ViewRules
}

function readStored(): StoredRules {
  try {
    return JSON.parse(localStorage.getItem(RULES_KEY) ?? '{}') as StoredRules
  } catch {
    return {}
  }
}

export function loadViewRules(name: string): ViewRules | null {
  const stored = readStored()[name]
  if (!stored || !Array.isArray(stored.conditions)) return null
  return { combine: stored.combine === 'or' ? 'or' : 'and', conditions: stored.conditions }
}

export function saveViewRules(name: string, rules: ViewRules): void {
  const stored = readStored()
  stored[name] = rules
  localStorage.setItem(RULES_KEY, JSON.stringify(stored))
}
