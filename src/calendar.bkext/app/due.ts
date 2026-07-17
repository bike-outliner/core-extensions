import { Color, CommandContext, Image, Text } from 'bike/app'
import { DueValue, dayDiffFromToday, dayKey, dueUrgency, parseDue } from '../dom/due-marks'

// The "due" feature: two commands (Set Due stamps today, Clear Due removes)
// that manage a `due` attribute on the selected rows, plus a value-aware
// badge showing the date relative when near ("Today", "Tomorrow", a weekday
// within the week). The badge's click card holds an inline calendar picker,
// an Include Time toggle, and Due Today / Tomorrow / This Week filters.
// The calendar inspector renders the same attribute as day marks and a
// day agenda (dom/Calendar.tsx) — that coupling is why due lives in the
// calendar extension.
//
// A due value is `YYYY-MM-DD` (local calendar date), or a full ISO-8601 UTC
// timestamp when a time is included. When the value has a time, the card's
// calendar carries a time picker too and commits both together — so the day
// and the time are picked in one place, and picking a day no longer closes
// the card out from under the time.
//
// TIME ZONES are the thing to be careful about here: the card speaks LOCAL
// wall-clock with no zone, while a timed `due` is stored as UTC. Everything
// crossing that boundary goes through `serializeCardValue` / `parseDue`
// (shared with the inspector in dom/due-marks.ts).

export function activateDue() {
  bike.commands.addCommands({
    commands: {
      'due:set': setDue,
      'due:clear': clearDue,
    },
  })

  bike.badge('due', {
    where: '.@due',
    inputs: { due: '@due', done: '@done' },
    // Relative labels depend on the wall clock, not just the row's value —
    // tick supplies env.now so "Tomorrow" rolls over to "Today" at midnight.
    tick: true,
    render: (values, env) => {
      const value = values['due'] ?? ''
      const due = parseDue(value)
      if (!due) return null
      const now = new Date((env.now ?? 0) * 1000)
      const dayDiff = dayDiffFromToday(due.date, now)
      // Urgency tint for OPEN items: red when due today or overdue, orange
      // when due tomorrow. A @done row's due date is history — it keeps the
      // row's inherited color no matter the date.
      const urgency = values['done'] != null ? 'later' : dueUrgency(dayDiff)
      const color =
        urgency === 'urgent' ? Color.systemRed() : urgency === 'soon' ? Color.systemOrange() : env.color
      // The full badge-metrics recipe (fontSize + padding size the tag,
      // stroke/radius draw its border), so this tag matches every other
      // drawn badge on the row.
      const bm = env.badgeMetrics
      return {
        image: Image.fromText(new Text(dueLabel(due, now), env.font.withPointSize(bm.fontSize), color.alphaSet(0.8)))
          .withBackground({
            stroke: color.alphaSet(0.3),
            strokeWidth: bm.strokeWidth,
            cornerRadius: bm.cornerRadius,
            padding: bm.padding,
          }),
        items: [
          { type: 'header', title: 'Due' },
          // `time: true` only asks for the picker — the converted value
          // carries the actual time, so the two can't disagree. `undefined`
          // for a date-only due, which keeps that card closing on the
          // day-pick exactly as it always has. (A plain property, not a
          // conditional spread: TypeScript doesn't excess-property-check
          // spreads, so a misspelled key there would build happily.)
          { type: 'calendar', id: 'due', value: serializeCardValue(due), time: due.hasTime || undefined },
          { type: 'toggle', id: 'time', title: 'Include Time', value: due.hasTime },
          { type: 'separator' },
          { type: 'button', id: 'filter-today', title: 'Due Today' },
          { type: 'button', id: 'filter-tomorrow', title: 'Due Tomorrow' },
          { type: 'button', id: 'filter-week', title: 'Due This Week' },
          { type: 'separator' },
          { type: 'button', id: 'command:due:clear', title: 'Clear Due' },
        ],
      }
    },
    onChange: (id, value, { editor, row }) => {
      if (id === 'due' && typeof value === 'string') {
        // The calendar commits `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm:ss` (local)
        // when it carries a time — both of which `parseDue` reads. The card
        // owns the time now, so there is no time-of-day to graft on: whatever
        // it reports IS the value, restated as UTC for storage.
        const picked = parseDue(value)
        if (!picked) return
        const next = picked.hasTime ? serializeTimestamp(picked.date) : serializeDateOnly(picked.date)
        editor.outline.transaction({ label: 'Set Due' }, () => {
          row.setAttribute('due', next)
        })
      } else if (id === 'time') {
        const due = parseDue(row.getAttribute('due') ?? '')
        if (!due) return
        editor.outline.transaction({ label: 'Set Due' }, () => {
          if (value === true) {
            due.date.setHours(9, 0, 0, 0)
            row.setAttribute('due', serializeTimestamp(due.date))
          } else {
            row.setAttribute('due', serializeDateOnly(due.date))
          }
        })
      }
    },
    onAction: (id, { editor }) => {
      if (id === 'filter-today') {
        editor.filter = {
          path: '//@due >=[d] today() and @due <[d] today() + days(1) and not @done',
          label: 'Due Today',
        }
      } else if (id === 'filter-tomorrow') {
        editor.filter = {
          path: '//@due >=[d] today() + days(1) and @due <[d] today() + days(2) and not @done',
          label: 'Due Tomorrow',
        }
      } else if (id === 'filter-week') {
        editor.filter = {
          path: '//@due >=[d] start-of-week(0) and @due <[d] start-of-week(1) and not @done',
          label: 'Due This Week',
        }
      }
    },
  })
}

// Stamp `due` with today's date on every selected row; adjust via the badge.
function setDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  const today = serializeDateOnly(new Date())
  editor.outline.transaction({ label: 'Set Due' }, () => {
    for (const row of rows) row.setAttribute('due', today)
  })
  return true
}

// Remove `due` from every selected row.
function clearDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  editor.outline.transaction({ label: 'Clear Due' }, () => {
    for (const row of rows) row.removeAttribute('due')
  })
  return true
}

// `parseDue` / `DueValue` / `dayKey` (the `YYYY-MM-DD` serialization) are
// shared with the calendar inspector via dom/due-marks.ts.
const serializeDateOnly = dayKey

// What the card's calendar wants: a local date, plus local wall-clock time
// when the value has one. Handing it the STORED string instead would be
// wrong for a timed due — that's UTC, so its date part is the wrong day
// whenever the two disagree (23:00 on the 14th in New York is the 15th UTC).
function serializeCardValue(due: DueValue): string {
  const day = serializeDateOnly(due.date)
  if (!due.hasTime) return day
  return `${day}T${pad(due.date.getHours())}:${pad(due.date.getMinutes())}:${pad(due.date.getSeconds())}`
}

// The card's ISO-8601 parser rejects fractional seconds, so build the UTC
// timestamp by hand instead of using toISOString().
function serializeTimestamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  )
}

// Display text is localized through Intl with bike.systemLocale. Formatters
// are cached because render runs every tick.
let formatters:
  | {
      relative: Intl.RelativeTimeFormat
      weekday: Intl.DateTimeFormat
      shortDate: Intl.DateTimeFormat
      shortDateYear: Intl.DateTimeFormat
      time: Intl.DateTimeFormat
    }
  | undefined

function dueFormatters() {
  formatters ??= {
    relative: new Intl.RelativeTimeFormat(bike.systemLocale, { numeric: 'auto' }),
    weekday: new Intl.DateTimeFormat(bike.systemLocale, { weekday: 'short' }),
    shortDate: new Intl.DateTimeFormat(bike.systemLocale, { month: 'short', day: 'numeric' }),
    shortDateYear: new Intl.DateTimeFormat(bike.systemLocale, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: new Intl.DateTimeFormat(bike.systemLocale, { hour: 'numeric', minute: '2-digit' }),
  }
  return formatters
}

function dueLabel(due: DueValue, now: Date): string {
  const { date, hasTime } = due
  const f = dueFormatters()
  const dayDiff = dayDiffFromToday(date, now)
  let label: string
  if (Math.abs(dayDiff) <= 1) {
    label = capitalize(f.relative.format(dayDiff, 'day'))
  } else if (dayDiff >= 2 && dayDiff <= 6) {
    label = f.weekday.format(date)
  } else {
    label = (date.getFullYear() === now.getFullYear() ? f.shortDate : f.shortDateYear).format(date)
  }
  // A timed due at exactly midnight (12am) shows no time component — the day
  // alone reads cleaner than a redundant "12:00 AM".
  if (hasTime && (date.getHours() !== 0 || date.getMinutes() !== 0)) {
    label += ` ${f.time.format(date)}`
  }
  return label
}

// Intl.RelativeTimeFormat returns mid-sentence casing ("tomorrow"); the badge
// is a standalone label.
function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(bike.systemLocale) + s.slice(1)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
