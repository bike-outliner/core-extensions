import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import './Calendar.css'
import { CalendarProtocol } from './protocols'
import {
  agendaTimeLabel,
  bucketByDay,
  dayKey,
  dueQueryPath,
  isDone,
  rowDisplayText,
  sortAgendaRows,
} from './due-marks'

// The day agenda — a SEPARATE inspector item from the calendar so it can be
// collapsed on its own or moved to its own tab. It shows the selected day, or
// Today when nothing is selected. The app relays the calendar/editor selection
// here via `selectDate`/`clearSelection` (the same messages the calendar gets);
// clicking an item navigates the editor directly through the session API.
function AgendaPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  // "Today" as state, re-anchored at each local midnight so the fallback and
  // the query window roll over without a reload.
  const [today, setToday] = useState(() => new Date())
  const [dueByDay, setDueByDay] = useState<Map<string, SessionRow[]>>(new Map())

  const agendaDate = selectedDate ?? today

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'selectDate':
          setSelectedDate(new Date(message.date))
          break
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

  // Live @due rows for the shown day — the agenda's OWN subscription (a single
  // day around `agendaDate`), so it's independent of whatever month the
  // calendar is paged to. Re-subscribe only when the shown day changes.
  useEffect(() => {
    const start = new Date(agendaDate.getFullYear(), agendaDate.getMonth(), agendaDate.getDate())
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    let sub: SessionSubscription | undefined
    let canceled = false
    bike.session
      .observeOutlineQuery(
        { path: dueQueryPath({ start, end }, today), shape: 'flat' },
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
  }, [dayKey(agendaDate), dayKey(today)])

  const agendaRows = sortAgendaRows(dueByDay.get(dayKey(agendaDate)) || [])

  const label =
    dayKey(agendaDate) === dayKey(today)
      ? 'Today'
      : agendaDate.toLocaleDateString(bike.systemLocale, { dateStyle: 'long' })

  return (
    <Disclosure
      className="calendar-disclosure"
      label={label}
      defaultExpanded
    >
      <div className="calendar-agenda">
        {agendaRows.length === 0 && <div className="calendar-agenda-empty">Nothing due</div>}
        {agendaRows.map((row) => {
          const time = agendaTimeLabel(row, bike.systemLocale)
          const done = isDone(row)
          return (
            <div key={row.id} className="calendar-agenda-item">
              <SFSymbol
                className="calendar-agenda-check"
                name={done ? 'checkmark.square' : 'square'}
                // Toggle the row's `done` attribute — the live query re-emits,
                // flipping the checkbox. The stamp matches native Toggle Done
                // (ISO-8601 UTC, no fractional seconds); null removes it.
                onClick={() =>
                  bike.session.updateRows({
                    rows: [row.id],
                    attributes: { done: done ? null : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
                  })
                }
              />
              <button
                className="calendar-agenda-label"
                type="button"
                onClick={() => bike.session.updateEditor({ select: row.id })}
              >
                {time && <span className="calendar-agenda-time">{time}</span>}
                {rowDisplayText(row) || 'Untitled'}
              </button>
            </div>
          )
        })}
      </div>
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<AgendaPanel context={context} />)
}
