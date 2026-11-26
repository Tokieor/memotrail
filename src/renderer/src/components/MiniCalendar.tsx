import { useMemo, useState } from 'react'
import type { Memo } from '@shared/types'

interface Props {
  memos: Memo[]
  /** `YYYY-MM-DD` of the day currently filtered, if any. */
  selectedDay?: string | null
  onSelectDay?: (day: string) => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface Cell {
  key: string
  day: number
  outside: boolean
  isToday: boolean
  count: number
  level: number
}

/** Month grid with a dot on days that already have notes. */
export function MiniCalendar({ memos, selectedDay = null, onSelectDay }: Props): JSX.Element {
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const memo of memos) {
      if (!memo.createTime) continue
      const date = new Date(memo.createTime)
      if (Number.isNaN(date.getTime())) continue
      const key = dayKey(date)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [memos])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())

    const todayKey = dayKey(today)
    const list: Cell[] = []
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const key = dayKey(date)
      const count = counts.get(key) ?? 0
      list.push({
        key,
        day: date.getDate(),
        outside: date.getMonth() !== cursor.getMonth(),
        isToday: key === todayKey,
        count,
        level: 0
      })
    }
    // Drop the trailing week when it belongs entirely to the next month.
    while (list.length > 35 && list.slice(-7).every((cell) => cell.outside)) list.splice(-7)

    // Levels are relative to the busiest day of the visible month, so a light
    // month still shows contrast and a heavy one does not turn uniformly dark.
    const peak = list.reduce((max, cell) => (cell.outside ? max : Math.max(max, cell.count)), 0)
    for (const cell of list) {
      cell.level = cell.count === 0 || peak === 0 ? 0 : Math.min(4, Math.ceil((cell.count / peak) * 4))
    }
    return list
  }, [cursor, counts])

  const shift = (delta: number): void => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  return (
    <div className="calendar-card">
      <div className="calendar-head">
        <span className="calendar-title">{cursor.getFullYear()}年{cursor.getMonth() + 1}月</span>
        <div className="calendar-nav">
          <button type="button" onClick={() => shift(-1)} aria-label="上个月">‹</button>
          <button type="button" onClick={() => shift(1)} aria-label="下个月">›</button>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => (
          <button
            key={cell.key}
            type="button"
            className={`calendar-day heat-${cell.outside ? 0 : cell.level}${cell.outside ? ' outside' : ''}${cell.isToday ? ' today' : ''}${cell.key === selectedDay ? ' selected' : ''}`}
            title={cell.count ? `${cell.count} 条笔记` : '没有笔记'}
            onClick={() => onSelectDay?.(cell.key)}
          >
            {cell.day}
            {cell.isToday && <i className="calendar-dot" />}
          </button>
        ))}
      </div>
    </div>
  )
}
