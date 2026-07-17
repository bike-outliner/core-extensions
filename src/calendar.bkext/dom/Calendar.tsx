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
  // The agenda's day is STICKY: it follows every day selection (calendar
  // click or selection sync) but survives clearSelection — otherwise
  // clicking an agenda item to navigate would clear the agenda out from
  // under the click.
  const [agendaDate, setAgendaDate] = useState<Date | null>(null)

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'selectDate': {
          const date = new Date(message.date)
          setSelectedDate(date)
          setAgendaDate(date)
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
  // neighboring-month tiles). The session query targets the host window's
  // outline by default and follows tab/document switches; re-subscribe only
  // when the visible MONTH changes — day-level activeStartDate changes keep
  // the same range. A null snapshot (nothing open) and onClose both clear.
  useEffect(() => {
    let sub: SessionSubscription | undefined
    let canceled = false
    bike.session
      .observeOutlineQuery(
        { path: dueQueryPath(visibleRange(activeStartDate)), shape: 'flat' },
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
    setAgendaDate(date)
    context.postMessage({
      type: 'dateChange',
      date: date.toISOString(),
    })
  }

  // Urgency tint matching the due badge, from OPEN items only: red when
  // due today or overdue, orange when due tomorrow. A day whose due items
  // are all @done keeps the neutral mark — a checked row's overdue date is
  // history. Count goes in a tooltip — tiles are too small for a number.
  function dueTileMark({ date, view }: { date: Date; view: string }) {
    if (view !== 'month') return null
    const rows = dueByDay.get(dayKey(date))
    if (!rows || rows.length === 0) return null
    const dayDiff = dayDiffFromToday(date, new Date())
    const anyOpen = rows.some((row) => !isDone(row))
    const urgency = anyOpen ? dueUrgency(dayDiff) : 'later'
    const past = dayDiff < 0 ? ' due-mark--past' : ''
    return <span className={`due-mark due-mark--${urgency}${past}`} title={`${rows.length} due`} />
  }

  const agendaRows = sortAgendaRows((agendaDate && dueByDay.get(dayKey(agendaDate))) || [])

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
      {agendaDate && agendaRows.length > 0 && (
        <div className="calendar-agenda">
          <div className="calendar-agenda-header">
            {agendaDate.toLocaleDateString(bike.systemLocale, { dateStyle: 'long' })}
          </div>
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
      )}
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<CalendarPanel context={context} />)
}
