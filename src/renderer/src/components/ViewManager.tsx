import { useState } from 'react'
import type { MemoView } from '@shared/types'
import {
  buildViewExpression,
  FIELD_DEFS,
  fieldOptions,
  loadViewRules,
  newCondition,
  saveViewRules,
  VIEW_EXAMPLES,
  type CombineMode,
  type FieldId,
  type ViewCondition,
  type ViewRules
} from '../lib/view-filter'
import { CheckIcon, CloseIcon, FilterIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons'

interface Props {
  views: MemoView[]
  tagNames: string[]
  activeView: string | null
  onClose: () => void
  /** 增删改后让时间线重新拉取官方视图列表。 */
  onRefresh: () => Promise<void> | void
  onApply: (name: string | null) => void
}

interface Draft {
  title: string
  emoji: string
  rules: ViewRules
  /** 服务端视图不是本客户端建的（没有本地条件结构）时退化为表达式编辑。 */
  rawMode: boolean
  raw: string
}

const EMOJIS = ['⭐', '📌', '📝', '💡', '✅', '🔖', '📅', '🌿', '🔍', '🚩']

function emptyDraft(): Draft {
  return { title: '', emoji: '⭐', rules: { combine: 'and', conditions: [newCondition()] }, rawMode: false, raw: '' }
}

function viewEmoji(view: MemoView): string {
  return view.icon?.emoji ?? '📌'
}

export function ViewManager({ views, tagNames, activeView, onClose, onRefresh, onApply }: Props): JSX.Element {
  const [editing, setEditing] = useState<MemoView | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [example, setExample] = useState('')

  const expression = draft.rawMode ? draft.raw.trim() : buildViewExpression(draft.rules)

  function openCreate(): void {
    setEditing('new')
    setDraft(emptyDraft())
    setMessage('')
    setExample('')
  }

  function openEdit(view: MemoView): void {
    const stored = loadViewRules(view.name)
    setEditing(view)
    setDraft({
      title: view.title,
      emoji: viewEmoji(view),
      rules: stored ?? { combine: 'and', conditions: [newCondition()] },
      rawMode: !stored,
      raw: view.filter
    })
    setMessage('')
    setExample('')
  }

  function patch(patch: Partial<Draft>): void {
    setDraft((current) => ({ ...current, ...patch }))
    setMessage('')
  }

  function patchCondition(id: string, patch: Partial<ViewCondition>): void {
    setDraft((current) => ({
      ...current,
      rules: {
        ...current.rules,
        conditions: current.rules.conditions.map((item) => (item.id === id ? { ...item, ...patch } : item))
      }
    }))
    setMessage('')
  }

  function changeField(condition: ViewCondition, field: FieldId): void {
    const def = FIELD_DEFS[field]
    const first = def.operators[0]
    patchCondition(condition.id, {
      field,
      op: first.id,
      value: first.kind === 'enum' ? (first.options?.[0]?.value ?? '') : ''
    })
  }

  function useExample(title: string): void {
    const found = VIEW_EXAMPLES.find((item) => item.title === title)
    if (!found) return
    setDraft((current) => ({
      ...current,
      rawMode: false,
      rules: { combine: found.rules.combine, conditions: found.rules.conditions.map((item) => ({ ...item, id: `${item.id}-${Date.now()}` })) }
    }))
    setMessage('')
    setExample('')
  }

  async function validate(): Promise<boolean> {
    if (!draft.title.trim()) {
      setMessage('请先填写视图名称')
      return false
    }
    if (!expression) {
      setMessage('请至少添加一条条件')
      return false
    }
    const result = await window.api.views.validate(expression)
    setMessage(result.success ? '✓ 表达式有效' : `表达式无效：${result.error ?? '未知错误'}`)
    return result.success
  }

  async function save(): Promise<void> {
    if (!(await validate())) return
    setBusy(true)
    const icon = draft.emoji ? { emoji: draft.emoji } : undefined
    const result = editing === 'new'
      ? await window.api.views.create({ title: draft.title.trim(), filter: expression, icon })
      : await window.api.views.update({
          ...(editing as MemoView),
          title: draft.title.trim(),
          filter: expression,
          ...(icon ? { icon } : {})
        })
    if (!result.success) {
      setMessage(result.error ?? '保存失败')
      setBusy(false)
      return
    }
    if (!draft.rawMode && result.data) saveViewRules(result.data.name, draft.rules)
    setEditing(null)
    setMessage('')
    await onRefresh()
    // 新建后直接应用，省得用户回到侧栏再点一次。
    if (editing === 'new' && result.data) onApply(result.data.name)
    setBusy(false)
  }

  async function remove(view: MemoView): Promise<void> {
    if (!window.confirm(`删除视图「${view.title}」？笔记本身不会被删除。`)) return
    setBusy(true)
    const result = await window.api.views.remove(view.name)
    if (!result.success) setMessage(result.error ?? '删除失败')
    if (activeView === view.name) onApply(null)
    await onRefresh()
    setBusy(false)
  }

  return (
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="view-dialog" role="dialog" aria-modal="true" aria-label="管理视图">
        <header className="view-dialog-head">
          <div>
            <h2>{editing ? (editing === 'new' ? '新建视图' : '编辑视图') : '视图'}</h2>
            <p>用条件筛选笔记，保存后可在侧栏一键切换。表达式由 Memos 服务端执行。</p>
          </div>
          <button className="meta-btn" title="关闭" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {editing ? (
          <div className="view-dialog-body">
            <div className="view-form-row">
              <label className="field-label">名称</label>
              <input
                className="field-input"
                value={draft.title}
                placeholder="例如：最近的待办"
                onChange={(event) => patch({ title: event.target.value })}
              />
            </div>

            <div className="view-form-row">
              <label className="field-label">图标</label>
              <div className="view-emoji-row">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`view-emoji${draft.emoji === emoji ? ' selected' : ''}`}
                    onClick={() => patch({ emoji })}
                  >{emoji}</button>
                ))}
              </div>
            </div>

            <div className="view-form-row">
              <label className="field-label">从示例开始</label>
              <select className="view-select" value={example} onChange={(event) => { setExample(event.target.value); useExample(event.target.value) }}>
                <option value="">选择一个示例…</option>
                {VIEW_EXAMPLES.map((item) => <option key={item.title} value={item.title}>{item.title}</option>)}
              </select>
            </div>

            <div className="view-form-row">
              <label className="field-label">筛选条件</label>
              {draft.rawMode ? (
                <p className="view-hint">这个视图由其它客户端创建，没有可还原的图形条件。可切换到表达式编辑，或新建同名视图。</p>
              ) : (
                <>
                  <div className="view-combine">
                    <span>条件之间</span>
                    {(['and', 'or'] as CombineMode[]).map((mode) => (
                      <button
                        key={mode}
                        className={draft.rules.combine === mode ? 'active' : ''}
                        onClick={() => patch({ rules: { ...draft.rules, combine: mode } })}
                      >{mode === 'and' ? '且 AND' : '或 OR'}</button>
                    ))}
                  </div>

                  <div className="view-condition-list">
                    {draft.rules.conditions.map((condition) => {
                      const def = FIELD_DEFS[condition.field]
                      const operator = def.operators.find((item) => item.id === condition.op) ?? def.operators[0]
                      return (
                        <div className="view-condition" key={condition.id}>
                          <select
                            className="view-select"
                            value={condition.field}
                            onChange={(event) => changeField(condition, event.target.value as FieldId)}
                          >
                            {fieldOptions().map((group) => (
                              <optgroup key={group.group} label={group.group}>
                                {group.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <select
                            className="view-select"
                            value={operator.id}
                            onChange={(event) => patchCondition(condition.id, { op: event.target.value })}
                          >
                            {def.operators.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                          {operator.kind === 'none' ? (
                            <span className="view-no-value">无需填写</span>
                          ) : operator.kind === 'enum' ? (
                            <select
                              className="view-select grow"
                              value={condition.value}
                              onChange={(event) => patchCondition(condition.id, { value: event.target.value })}
                            >
                              {(operator.options ?? []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="field-input grow"
                              type={operator.kind === 'number' ? 'number' : 'text'}
                              list={operator.kind === 'tags' ? 'view-tag-options' : undefined}
                              value={condition.value}
                              placeholder={operator.placeholder ?? '填写值'}
                              onChange={(event) => patchCondition(condition.id, { value: event.target.value })}
                            />
                          )}
                          <button
                            className={`view-not${condition.negate ? ' on' : ''}`}
                            title="排除：对这条条件取反"
                            onClick={() => patchCondition(condition.id, { negate: !condition.negate })}
                          >非</button>
                          <button
                            className="meta-btn"
                            title="删除条件"
                            onClick={() => patch({ rules: { ...draft.rules, conditions: draft.rules.conditions.filter((item) => item.id !== condition.id) } })}
                          ><CloseIcon size={14} /></button>
                        </div>
                      )
                    })}
                    <datalist id="view-tag-options">
                      {tagNames.map((name) => <option key={name} value={name} />)}
                    </datalist>
                  </div>
                  <button className="secondary-btn" onClick={() => patch({ rules: { ...draft.rules, conditions: [...draft.rules.conditions, newCondition()] } })}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlusIcon size={13} />添加条件</span>
                  </button>
                </>
              )}
            </div>

            <div className="view-form-row">
              <label className="field-label">
                CEL 表达式
                {draft.rawMode && <button className="meta-btn" onClick={() => patch({ rawMode: false })}>改用图形条件</button>}
                {!draft.rawMode && <button className="meta-btn" onClick={() => patch({ rawMode: true, raw: expression })}>直接编辑表达式</button>}
              </label>
              {draft.rawMode ? (
                <textarea className="view-raw" rows={4} value={draft.raw} onChange={(event) => patch({ raw: event.target.value })} />
              ) : (
                <pre className="view-expression">{expression || '（还没有条件）'}</pre>
              )}
            </div>
          </div>
        ) : (
          <div className="view-dialog-body view-list">
            {views.length === 0 && <p className="view-empty">还没有视图。点「新建视图」用条件筛出一组常用笔记。</p>}
            {views.map((view) => (
              <div className={`view-row${activeView === view.name ? ' active' : ''}`} key={view.name}>
                <button className="view-row-main" onClick={() => { onApply(activeView === view.name ? null : view.name); onClose() }}>
                  <span className="view-row-icon">{viewEmoji(view)}</span>
                  <span className="view-row-text">
                    <span className="view-row-title">{view.title}</span>
                    <code>{view.filter}</code>
                  </span>
                  {activeView === view.name && <CheckIcon size={15} />}
                </button>
                <button className="meta-btn" title="编辑" onClick={() => openEdit(view)}><PencilIcon size={15} /></button>
                <button className="meta-btn danger" title="删除" onClick={() => void remove(view)} disabled={busy}><TrashIcon size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <footer className="view-dialog-foot">
          {message && <span className={`view-message${message.startsWith('✓') ? ' ok' : ''}`}>{message}</span>}
          <span className="spacer" />
          {editing ? (
            <>
              <button className="secondary-btn" onClick={() => void validate()} disabled={busy}>校验</button>
              <button className="primary-btn" onClick={() => void save()} disabled={busy || !draft.title.trim() || !expression}>
                {busy ? '保存中…' : '保存'}
              </button>
              <button className="secondary-btn" onClick={() => setEditing(null)} disabled={busy}>返回</button>
            </>
          ) : (
            <>
              <button className="secondary-btn" onClick={onClose}>关闭</button>
              <button className="primary-btn" onClick={openCreate}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlusIcon size={14} />新建视图</span></button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

/** 侧栏列表用的小图标，避免把 FilterIcon 的 path 散落在两处。 */
export function ViewGlyph(): JSX.Element {
  return <FilterIcon size={18} />
}
