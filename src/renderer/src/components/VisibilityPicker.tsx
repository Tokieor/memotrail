import { useEffect, useRef, useState } from 'react'
import { CheckIcon, GlobeIcon, LockIcon, ShieldIcon } from './Icons'

/** The three visibilities a user can pick (Memos also has SPACE, unused here). */
export type PickableVisibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

interface Props {
  value: string
  onChange: (next: PickableVisibility) => void
  size?: number
}

const OPTIONS = [
  { value: 'PRIVATE', label: '私密', hint: '仅自己可见', Icon: LockIcon },
  { value: 'PROTECTED', label: '受保护', hint: '登录后可读', Icon: ShieldIcon },
  { value: 'PUBLIC', label: '公开', hint: '所有人可见', Icon: GlobeIcon }
] as const

/** One icon showing the current visibility; click to pick another. */
export function VisibilityPicker({ value, onChange, size = 16 }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="visibility-picker" ref={root}>
      <button
        type="button"
        className={`vis-trigger${open ? ' open' : ''}`}
        title={`可见范围：${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`可见范围：${current.label}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <current.Icon size={size} />
      </button>
      {open ? (
        <div className="vis-menu" role="menu">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={option.value === value ? 'active' : ''}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <option.Icon size={14} />
              <span className="vis-label">{option.label}</span>
              <span className="vis-hint">{option.hint}</span>
              {option.value === value ? <CheckIcon size={13} className="vis-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
