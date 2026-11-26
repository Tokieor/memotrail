import { GlobeIcon, LockIcon, ShieldIcon } from './Icons'

/** The three visibilities a user can pick (Memos also has SPACE, unused here). */
export type PickableVisibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

interface Props {
  value: string
  onChange: (next: PickableVisibility) => void
  size?: number
}

const OPTIONS: { value: PickableVisibility; label: string; Icon: typeof LockIcon }[] = [
  { value: 'PRIVATE', label: '私密 · 仅自己可见', Icon: LockIcon },
  { value: 'PROTECTED', label: '受保护 · 登录后可读', Icon: ShieldIcon },
  { value: 'PUBLIC', label: '公开 · 所有人可见', Icon: GlobeIcon }
]

/** Three icon buttons replacing the old text dropdown. */
export function VisibilityPicker({ value, onChange, size = 16 }: Props): JSX.Element {
  return (
    <div className="visibility-picker" role="group" aria-label="可见范围">
      {OPTIONS.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          className={option === value ? 'active' : ''}
          title={label}
          aria-pressed={option === value}
          aria-label={label}
          onClick={() => onChange(option)}
        >
          <Icon size={size} />
        </button>
      ))}
    </div>
  )
}
