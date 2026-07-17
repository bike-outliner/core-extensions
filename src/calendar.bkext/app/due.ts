import { Color, CommandContext, Image, Text } from 'bike/app'
import { DueValue, dayDiffFromToday, dayKey, dueUrgency, parseDue } from '../dom/due-marks'

// The "due" feature: two commands (Set Due stamps today, Clear Due removes)
// that manage a `due` attribute on the selected rows, plus a value-aware
// badge showing the date relative when near ("Today", "Tomorrow", a weekday
// within the week). The badge's click card holds an inline calendar picker
// with a time picker, and Due Today / Tomorrow / This Week filters.
// The calendar inspector renders the same attribute as day marks and a
// day agenda (dom/Calendar.tsx) — that coupling is why due lives in the
// calendar extension.
//
// A due value is `YYYY-MM-DD` (local calendar date), or a full ISO-8601 UTC
// timestamp when a time is included. The card's time picker is always shown
// and defaults to 12am; leaving it there means "no specific time" — a
// midnight commit stores date-only, anything else stores the timestamp.
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
          // `time: true` only sets the picker's default (midnight) — a time
          // in the converted value wins, so the two can't disagree.
          { type: 'calendar', id: 'due', value: serializeCardValue(due), time: true },
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
        // The card's calendar always carries a time, so it commits
        // `YYYY-MM-DDTHH:mm:ss` (local). A time left at the midnight default
        // means "no specific time" and stores date-only; anything else is a
        // real time, restated as UTC for storage.
        const picked = parseDue(value)
        if (!picked) return
        const hasTime =
          picked.hasTime &&
          (picked.date.getHours() !== 0 || picked.date.getMinutes() !== 0 || picked.date.getSeconds() !== 0)
        const next = hasTime ? serializeTimestamp(picked.date) : serializeDateOnly(picked.date)
        editor.outline.transaction({ label: 'Set Due' }, () => {
          row.setAttribute('due', next)
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
