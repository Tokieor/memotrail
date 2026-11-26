import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 18, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props }
}

export function LogoMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="20" height="22" rx="5" fill="var(--accent)" />
      <path d="M16 3v5h8" stroke="var(--paper)" strokeWidth="1.5" fill="none" />
      <rect x="8" y="12" width="10" height="2" rx="1" fill="var(--on-accent)" />
      <rect x="8" y="17" width="7" height="2" rx="1" fill="var(--on-accent)" opacity="0.65" />
    </svg>
  )
}

export function PlusIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

export function NotesIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
}

export function CalendarIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export function LockIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="4.5" y="10" width="15" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7.6a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}

export function ShieldIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M12 3l7 2.6v5.6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V5.6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
}

export function GlobeIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" /><path d="M3.6 12h16.8M12 3.6c2.2 2.4 3.4 5.3 3.4 8.4s-1.2 6-3.4 8.4c-2.2-2.4-3.4-5.3-3.4-8.4s1.2-6 3.4-8.4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }): JSX.Element {
  return <svg {...base(props)}><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill={filled ? 'currentColor' : 'none'} /></svg>
}

export function ArchiveIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" /><path d="M5 8v12h14V8M10 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
}

export function SearchIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

export function TagIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M3 11V4h7l10 10-7 7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" /></svg>
}

export function ImageIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.6" /><path d="M21 16l-5-5L5 20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
}

export function LinkIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
}

export function MoreIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2 2-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21h-3v-.1a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06-2-2 .06-.06A1.7 1.7 0 0 0 7.34 15a1.7 1.7 0 0 0-1.56-1H5.7v-3h.08a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06 2-2 .06.06a1.7 1.7 0 0 0 1.87.34H11a1.7 1.7 0 0 0 1-1.56V5.7h3v.08a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06 2 2-.06.06A1.7 1.7 0 0 0 19.4 11v.1a1.7 1.7 0 0 0 1.56 1h.1v3h-.1a1.7 1.7 0 0 0-1.56 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}

export function SyncIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M20 12a8 8 0 1 1-2-5.3M20 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
}

export function BackIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M18 8l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function CheckIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" fill="#5C7F6F" /><path d="M8 12l3 3 5-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function ClearIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" fill="#DCD8D0" /><path d="M9 9l6 6M15 9l-6 6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" /></svg>
}

export function ChevronIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function EyeIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" /></svg>
}

export function CopyIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" /></svg>
}

export function TrashIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function BoltIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" /></svg>
}

export function HashChipIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M9 3L7 21M17 3l-2 18M3 9h18M3 15h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
}

export function CardViewIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>
}

export function ListViewIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M9 8h11M9 13h11M9 18h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="5" cy="8" r="1.3" fill="currentColor" /><circle cx="5" cy="13" r="1.3" fill="currentColor" /><circle cx="5" cy="18" r="1.3" fill="currentColor" /></svg>
}

/* Markdown toolbar icons */
export function HeadingIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M5 5v14M13 5v14M5 12h8M16 9l4-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function ListIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M9 7h11M9 12h11M9 17h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="5" cy="7" r="1.3" fill="currentColor" /><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="5" cy="17" r="1.3" fill="currentColor" /></svg>
}

export function QuoteIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M7 7h4v5H8.5c-.8 0-1.2.4-1.5 1.2V7zM15 7h4v5h-2.5c-.8 0-1.2.4-1.5 1.2V7z" fill="currentColor" /><path d="M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
}

export function CodeIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function CodeBlockIcon(props: IconProps): JSX.Element {
  return <svg {...base(props)}><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 9l-2 3 2 3M15 9l2 3-2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
