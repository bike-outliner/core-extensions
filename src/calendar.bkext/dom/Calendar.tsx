import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import Calendar from 'react-calendar'
import './Calendar.css'
import { CalendarProtocol } from './protocols'
import {
  agendaTimeLabel,
  bucketByDay,
  dayDiffFromToday,
  dayKey,
  dueQueryPath,
  dueUrgency,
  isDone,
  rowDisplayText,
  sortAgendaRows,
  visibleRange,
} from './due-marks'

function CalendarPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [activeStartDate, setActiveStartDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showWeekNumbers, setShowWeekNumbers] = useState(() => bike.defaults.get('showWeekNumbers') !== false)
  const [dueByDay, setDueByDay] = useState<Map<string, SessionRow[]>>(new Map())
  // The agenda shows the selected day, or Today when nothing is selected —
  // so clicking an agenda item (which navigates the editor and usually
  // clears the calendar selection) lands on Today's agenda rather than
  // leaving the panel empty or pinned to a stale day.
  const agendaDate = selectedDate ?? new Date()

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

  // Live @due rows for the displayed month (padded a week each side for
  // neighboring-month tiles), plus today's rows so the agenda's Today
  // fallback has data even when paged to a distant month. The session query
  // targets the host window's outline by default and follows tab/document
  // switches; re-subscribe only when the visible MONTH changes — day-level
  // activeStartDate changes keep the same range. A null snapshot (nothing
  // open) and onClose both clear.
  useEffect(() => {
    let sub: SessionSubscription | undefined
    let canceled = false
    bike.session
      .observeOutlineQuery(
        { path: dueQueryPath(visibleRange(activeStartDate), new Date()), shape: 'flat' },
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
  }, [activeStartDate.getFullYear(), activeStartDate.getMonth()])

  const monthYear = activeStartDate.toLocaleDateString(bike.systemLocale, { month: 'long', year: 'numeric' })

  function onChange(nextValue: any) {
    const date = nextValue instanceof Date ? nextValue : new Date(String(nextValue))
    setSelectedDate(date)
    context.postMessage({
      type: 'dateChange',
      date: date.toISOString(),
    })
  }

  // Urgency tint matching the due badge, from OPEN items only: red when due
  // today or overdue (an overdue item is a fire whether or not the day is
  // past), orange when due tomorrow, the accent when further out. A day whose
  // due items are ALL @done is history, not a fire — it draws a neutral
  // (tertiary) mark. Count goes in a tooltip — tiles are too small for a number.
  function dueTileMark({ date, view }: { date: Date; view: string }) {
    if (view !== 'month') return null
    const rows = dueByDay.get(dayKey(date))
    if (!rows || rows.length === 0) return null
    const dayDiff = dayDiffFromToday(date, new Date())
    const anyOpen = rows.some((row) => !isDone(row))
    const variant = anyOpen ? dueUrgency(dayDiff) : 'done'
    return <span className={`due-mark due-mark--${variant}`} title={`${rows.length} due`} />
  }

  const agendaRows = sortAgendaRows(dueByDay.get(dayKey(agendaDate)) || [])

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
      />
      <div className="calendar-agenda">
        <div className="calendar-agenda-header">
          {agendaDate.toLocaleDateString(bike.systemLocale, { dateStyle: 'long' })}
        </div>
        {agendaRows.length === 0 && <div className="calendar-agenda-empty">Nothing due</div>}
        {agendaRows.map((row) => {
          const time = agendaTimeLabel(row, bike.systemLocale)
          return (
            <button
              key={row.id}
              className="calendar-agenda-item"
              type="button"
              onClick={() => bike.session.updateEditor({ select: row.id })}
            >
              {time && <span className="calendar-agenda-time">{time}</span>}
              {rowDisplayText(row) || 'Untitled'}
            </button>
          )
        })}
      </div>
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<CalendarPanel context={context} />)
}
