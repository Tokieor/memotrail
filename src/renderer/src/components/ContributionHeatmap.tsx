import { useMemo } from 'react'
import type { Memo } from '@shared/types'

interface Props {
  memos: Memo[]
  weeks?: number
}

interface DayCell {
  key: string
  date: Date
  count: number
  level: number
}

function localKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

/** GitHub-style contribution grid driven by memo creation dates. */
export function ContributionHeatmap({ memos, weeks = 16 }: Props): JSX.Element {
  const { cells, monthMarks, total } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const memo of memos) {
      if (!memo.createTime) continue
      const date = new Date(memo.createTime)
      if (Number.isNaN(date.getTime())) continue
      const key = localKey(date)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // Start from the Monday of the current week, then go back (weeks - 1) weeks.
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dayOfWeek = (now.getDay() + 6) % 7 // Mon = 0
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - dayOfWeek)
    const start = new Date(thisMonday)
    start.setDate(thisMonday.getDate() - (weeks - 1) * 7)

    const cells: DayCell[] = []
    const monthMarks: { col: number; label: string }[] = []
    let total = 0
    let lastMonth = -1
    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < 7; row++) {
        const date = new Date(start)
        date.setDate(start.getDate() + col * 7 + row)
        // Mark the first column whose week contains a new month.
        if (row === 0 && date.getMonth() !== lastMonth) {
          lastMonth = date.getMonth()
          monthMarks.push({ col, label: MONTH_LABELS[lastMonth] })
        }
        const count = counts.get(localKey(date)) ?? 0
        total += count
        const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4
        cells.push({ key: localKey(date), date, count, level })
      }
    }
    return { cells, monthMarks, total }
  }, [memos, weeks])

  return (
    <div className="heatmap-card">
      <div className="heatmap-head">
        <span className="heatmap-title">笔记热力</span>
        <span className="heatmap-total">近 {weeks} 周 · {total} 条</span>
      </div>
      <div className="heatmap-months" aria-hidden="true">
        {monthMarks.map((mark) => (
          <span key={`${mark.col}-${mark.label}`} style={{ gridColumn: mark.col + 1 }}>{mark.label}</span>
        ))}
      </div>
      <div className="heatmap-grid">
        {cells.map((cell) => (
          <span
            key={cell.key}
            className={`heatmap-cell level-${cell.level}`}
            title={`${cell.date.getFullYear()}年${cell.date.getMonth() + 1}月${cell.date.getDate()}日 · ${cell.count} 条笔记`}
          />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`heatmap-cell level-${level}`} />)}
        <span>多</span>
      </div>
    </div>
  )
}
