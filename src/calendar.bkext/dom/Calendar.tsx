import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import Calendar from 'react-calendar'
import './Calendar.css'
import { CalendarProtocol } from './protocols'
import {
  bucketByDay,
  dayDiffFromToday,
  dayKey,
  dueQueryPath,
  dueUrgency,
  isDone,
  parseDue,
  visibleRange,
} from './due-marks'

function CalendarPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [activeStartDate, setActiveStartDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showWeekNumbers, setShowWeekNumbers] = useState(() => bike.defaults.get('showWeekNumbers') !== false)
  const [dueByDay, setDueByDay] = useState<Map<string, SessionRow[]>>(new Map())
  // "Today" as state, re-anchored at each local midnight (see the timer
  // effect) so day marks, the agenda's Today fallback, and urgency tints don't
  // freeze at the day the panel was opened when it stays up overnight.
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'selectDate': {
          const date = new Date(message.date)
          setSelectedDate(date)
          setActiveStartDate(date)
          break
        }
        case 'clearSelection':
          setSelectedDate(null)
          break
      }
    }
    return () => {
      context.onmessage = undefined
    }
  }, [])

  useEffect(() => {
    const disposable = bike.defaults.observe('showWeekNumbers', (v) => setShowWeekNumbers(v !== false))
    return () => disposable.dispose()
  }, [])

  // Native row drags (bike:rowdrag* events, delegated on the context
  // element). Dropping rows on a day tile sets their @due to that day —
  // the payload's outline/rows ids are bike.session's, so this works even
  // for rows dragged from a different document. The date rides on the
  // tile's `cal-day-YYYY-MM-DD` class (tileContent spans are
  // pointer-events: none, invisible to the dispatcher's hit-test). Hover
  // highlight is a manual class — native drags don't trigger CSS :hover.
  useEffect(() => {
    const el = context.element
    let hoverTile: Element | null = null
    const tileFor = (target: EventTarget | null) => {
      const tile = (target as HTMLElement | null)?.closest?.('.react-calendar__tile')
      const match = tile && Array.from(tile.classList).find((c) => c.startsWith('cal-day-'))
      return match ? { tile, date: match.slice('cal-day-'.length) } : null
    }
    const setHover = (tile: Element | null) => {
      if (hoverTile === tile) return
      hoverTile?.classList.remove('row-drop-target')
      hoverTile = tile
      hoverTile?.classList.add('row-drop-target')
    }
    const onOver = (e: RowDragEvent) => {
      const hit = tileFor(e.target)
      setHover(hit?.tile ?? null)
      if (hit) e.preventDefault()
    }
    const onLeave = () => setHover(null)
    const onDrop = (e: RowDragEvent) => {
      const hit = tileFor(e.target)
      setHover(null)
      if (!hit) return
      const { outline, rows } = e.detail
      bike.session.updateRows({ outline, rows, attributes: { due: hit.date } })
    }
    el.addEventListener('bike:rowdragover', onOver)
    el.addEventListener('bike:rowdragleave', onLeave)
    el.addEventListener('bike:rowdrop', onDrop)
    return () => {
      el.removeEventListener('bike:rowdragover', onOver)
      el.removeEventListener('bike:rowdragleave', onLeave)
      el.removeEventListener('bike:rowdrop', onDrop)
    }
  }, [])

  // Fire at each local midnight to re-anchor `today`; the query effect below
  // depends on `today`'s day key, so it re-subscribes with a fresh `today()`
  // window after the rollover. The timer re-arms itself for the next midnight.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const scheduleNextMidnight = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        setToday(new Date())
        scheduleNextMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleNextMidnight()
    return () => clearTimeout(timer)
  }, [])

  // Live @due rows for the displayed month (padded a week each side for
  // neighboring-month tiles), driving the day marks. The session query targets
  // the host window's outline by default and follows tab/document switches;
  // re-subscribe only when the visible MONTH changes — day-level
  // activeStartDate changes keep the same range. A null snapshot (nothing
  // open) and onClose both clear. (The agenda has its own subscription.)
  useEffect(() => {
    let sub: SessionSubscription | undefined
    let canceled = false
    bike.session
      .observeOutlineQuery(
        { path: dueQueryPath(visibleRange(activeStartDate), today), shape: 'flat' },
        (snapshot) => setDueByDay(bucketByDay(snapshot?.root.children)),
        { onClose: () => setDueByDay(new Map()) },
      )
      .then((s) => {
        if (canceled) {
          s.dispose()
        } else {
          sub = s
        }
      })
    return () => {
      canceled = true
      sub?.dispose()
    }
  }, [activeStartDate.getFullYear(), activeStartDate.getMonth(), dayKey(today)])

  const monthYear = activeStartDate.toLocaleDateString(bike.systemLocale, { month: 'long', year: 'numeric' })

  // Visit a day: the app creates its row if needed and shows it — agenda
  // when the day has due items, `option` (⌥) jumps straight to the day row.
  // `activate` (Return / double-click) additionally hands keyboard focus to
  // the editor. Read altKey at event time; the modifier may be released
  // before the async message reaches the app.
  function visit(date: Date, options: { activate?: boolean; option?: boolean } = {}) {
    setSelectedDate(date)
    context.postMessage({
      type: 'dateChange',
      date: date.toISOString(),
      option: options.option === true,
      activate: options.activate === true,
    })
  }

  // react-calendar hands the click's MouseEvent as the second arg; the nav
  // "today" button calls this with none.
  function onChange(nextValue: any, event?: { altKey?: boolean }) {
    const date = nextValue instanceof Date ? nextValue : new Date(String(nextValue))
    visit(date, { option: event?.altKey })
  }

  // Arrow keys walk days like clicks (←/→ ±1 day, ↑/↓ ±7 = one grid row);
  // Return re-visits the selected day and focuses the editor. Listen on
  // window: WebKit doesn't move DOM focus to a button on click, so after a
  // tile click key events dispatch to body and never pass through this
  // panel's element. Capture phase + preventDefault so a focused tile
  // button's own Enter activation can't double-fire, and so arrows don't
  // scroll the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const step =
        e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
      if (step !== 0) {
        e.preventDefault()
        e.stopPropagation()
        const base = selectedDate ?? today
        const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + step)
        setActiveStartDate(next)
        visit(next, { option: e.altKey })
        return
      }
      if (e.key === 'Enter' && selectedDate) {
        e.preventDefault()
        e.stopPropagation()
        visit(selectedDate, { activate: true, option: e.altKey })
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [selectedDate, today])

  // Double-click a day tile = visit + focus the editor, same as Return.
  // The pair's first click already visited.
  useEffect(() => {
    const el = context.element
    const onDoubleClick = (e: MouseEvent) => {
      const tile = (e.target as HTMLElement | null)?.closest?.('.react-calendar__tile')
      const match = tile && Array.from(tile.classList).find((c) => c.startsWith('cal-day-'))
      if (!match) return
      const due = parseDue(match.slice('cal-day-'.length))
      if (!due) return
      e.preventDefault()
      visit(due.date, { activate: true, option: e.altKey })
    }
    el.addEventListener('dblclick', onDoubleClick)
    return () => el.removeEventListener('dblclick', onDoubleClick)
  }, [])

  // Urgency tint matching the due badge, from OPEN items only: red when due
  // today or overdue (an overdue item is a fire whether or not the day is
  // past), orange when due tomorrow, the accent when further out. A day whose
  // due items are ALL @done is history, not a fire — it draws a neutral
  // (tertiary) mark. Count goes in a tooltip — tiles are too small for a number.
  function dueTileMark({ date, view }: { date: Date; view: string }) {
    if (view !== 'month') return null
    const rows = dueByDay.get(dayKey(date))
    if (!rows || rows.length === 0) return null
    const dayDiff = dayDiffFromToday(date, today)
    const anyOpen = rows.some((row) => !isDone(row))
    const variant = anyOpen ? dueUrgency(dayDiff) : 'done'
    return <span className={`due-mark due-mark--${variant}`} title={`${rows.length} due`} />
  }

  const navBar = (
    <div className="calendar-nav-bar">
      <button className="calendar-nav-button" onClick={() => setActiveStartDate(d => new Date(d.getFullYear(), d.getMonth() - 1))} type="button">
        <SFSymbol name="chevron.backward" scale="small" />
      </button>
      <button className="calendar-nav-button" onClick={() => { setActiveStartDate(new Date()); onChange(new Date()) }} type="button">
        <SFSymbol name="suit.diamond" scale="small" />
      </button>
      <button className="calendar-nav-button" onClick={() => setActiveStartDate(d => new Date(d.getFullYear(), d.getMonth() + 1))} type="button">
        <SFSymbol name="chevron.forward" scale="small" />
      </button>
    </div>
  )

  return (
    <Disclosure
      className="calendar-disclosure"
      label={monthYear}
      accessory={navBar}
      accessoryAlignment="trailing"
      defaultExpanded
    >
      <Calendar
        className={selectedDate ? '' : 'no-selection'}
        onChange={onChange}
        value={selectedDate}
        activeStartDate={activeStartDate}
        onActiveStartDateChange={({ activeStartDate: d }) => { if (d) setActiveStartDate(d) }}
        showNavigation={false}
        showWeekNumbers={showWeekNumbers}
        maxDetail="month"
        minDetail="month"
        locale={bike.systemLocale}
        calendarType={bike.systemFirstWeekday === 0 ? 'gregory' : bike.systemFirstWeekday === 6 ? 'islamic' : 'iso8601'}
        formatShortWeekday={(_locale: any, date: Date) => date.toLocaleDateString(bike.systemLocale, { weekday: 'narrow' })}
        tileContent={dueTileMark}
        tileClassName={({ date, view }: { date: Date; view: string }) =>
          view === 'month' ? `cal-day-${dayKey(date)}` : null
        }
      />
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<CalendarPanel context={context} />)
}
