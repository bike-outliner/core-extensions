import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import './Calendar.css'
import { CalendarProtocol } from './protocols'
import {
  DateAttribute,
  DateHit,
  agendaTimeLabel,
  bucketByDay,
  dateQueryPath,
  dayKey,
  isClosed,
  rowDisplayText,
  sortAgendaHits,
} from './date-marks'

// The day agenda — a SEPARATE inspector item from the calendar so it can be
// collapsed on its own or moved to its own tab. It lists the rows dated on
// the selected day by ANY calendar-visible date attribute, or Today when
// nothing is selected. The app relays the calendar/editor selection
// here via `selectDate`/`clearSelection` (the same messages the calendar gets);
// clicking an item navigates the editor directly through the session API.
function AgendaPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  // "Today" as state, re-anchored at each local midnight so the fallback and
  // the query window roll over without a reload.
  const [today, setToday] = useState(() => new Date())
  // Every calendar-visible date attribute, pushed by the app — only the app
  // context can observe the attribute registry.
  const [dateAttributes, setDateAttributes] = useState<DateAttribute[]>([])
  const [dateByDay, setDateByDay] = useState<Map<string, DateHit<SessionRow>[]>>(new Map())

  const agendaDate = selectedDate ?? today
  const names = dateAttributes.map((attribute) => attribute.name)
  const titleByName = new Map(dateAttributes.map((attribute) => [attribute.name, attribute.title]))
  const namesKey = names.join(',')

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'dateAttributes':
          setDateAttributes(message.attributes)
          break
        case 'selectDate':
          setSelectedDate(new Date(message.date))
          break
        case 'clearSelection':
          setSelectedDate(null)
          break
      }
    }
    // Pull only AFTER onmessage is installed — app→DOM messages sent before
    // that are dropped.
    context.postMessage({ type: 'ready' })
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

  // Live dated rows for the shown day — the agenda's OWN subscription (a
  // single day around `agendaDate`), so it's independent of whatever month
  // the calendar is paged to. Re-subscribe when the shown day or the
  // attribute list changes.
  useEffect(() => {
    const start = new Date(agendaDate.getFullYear(), agendaDate.getMonth(), agendaDate.getDate())
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    let sub: SessionSubscription | undefined
    let canceled = false
    bike.session
      .observeOutlineQuery(
        { path: dateQueryPath(names, { start, end }, today), shape: 'flat' },
        (snapshot) => setDateByDay(bucketByDay(snapshot?.root.children, names)),
        { onClose: () => setDateByDay(new Map()) },
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
  }, [dayKey(agendaDate), dayKey(today), namesKey])

  const agendaHits = sortAgendaHits(dateByDay.get(dayKey(agendaDate)) || [])

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
        {agendaHits.length === 0 && <div className="calendar-agenda-empty">Nothing scheduled</div>}
        {agendaHits.map(({ row, attribute, value }) => {
          const time = agendaTimeLabel(value, bike.systemLocale)
          const closed = isClosed(row)
          return (
            // A row carrying two date attributes lands on two days — and on
            // one day twice when they coincide — so the key is the pair.
            <div key={`${row.id}:${attribute}`} className="calendar-agenda-item">
              <SFSymbol
                className="calendar-agenda-check"
                // Binary, like the editor's checkbox: open or closed. A
                // canceled row reads as checked here too — the distinction
                // lives in the editor's status badge, not in this glyph.
                name={closed ? 'checkmark.square' : 'square'}
                // Through the host setter, not updateRows: `status:*`
                // owns the maintenance — a running clock stops, and tasks
                // that keep a log record the change. The live query re-emits,
                // flipping the checkbox.
                onClick={() =>
                  bike.session.evaluateCommands({
                    ids: [closed ? 'status:todo' : 'status:done'],
                    rows: [row.id],
                  })
                }
              />
              <button
                className="calendar-agenda-label"
                type="button"
                // `activate` because clicking here made this webview first responder —
                // without it the caret lands but keystrokes stay in the inspector.
                onClick={() => bike.session.updateEditor({ select: row.id, activate: true })}
              >
                {time && <span className="calendar-agenda-time">{time}</span>}
                {rowDisplayText(row) || 'Untitled'}
                {/* Which attribute put the row here — only worth saying
                    when more than one date attribute can. */}
                {dateAttributes.length > 1 && (
                  <span className="calendar-agenda-attribute">
                    {titleByName.get(attribute) ?? attribute}
                  </span>
                )}
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
