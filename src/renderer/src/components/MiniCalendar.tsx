import { useMemo, useState } from 'react'
import type { Memo } from '@shared/types'

interface Props {
  memos: Memo[]
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
export function MiniCalendar({ memos }: Props): JSX.Element {
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
        // Same four-step scale as the contribution heatmap.
        level: count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4
      })
    }
    // Drop the trailing week when it belongs entirely to the next month.
    while (list.length > 35 && list.slice(-7).every((cell) => cell.outside)) list.splice(-7)
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
          <span
            key={cell.key}
            className={`calendar-day heat-${cell.outside ? 0 : cell.level}${cell.outside ? ' outside' : ''}${cell.isToday ? ' today' : ''}`}
            title={cell.count ? `${cell.count} 条笔记` : undefined}
          >
            {cell.day}
            {cell.isToday && <i className="calendar-dot" />}
          </span>
        ))}
      </div>
    </div>
  )
}
