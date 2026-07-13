import { AppExtensionContext, Color, CommandContext, Image, Insets, Text } from 'bike/app'

// The "due" feature: two commands (Set Due stamps today, Clear Due removes)
// that manage a `due` attribute on the selected rows, plus a value-aware
// badge showing the date relative when near ("Today", "Tomorrow", a weekday
// within the week). The badge's click card holds an inline calendar picker,
// an optional time-of-day toggle, and Due Today / Tomorrow / This Week
// filters. A due value is `YYYY-MM-DD` (local calendar date), or a full
// ISO-8601 UTC timestamp when a time is included — the two forms the card's
// date picker itself commits and parses.

export async function activate(context: AppExtensionContext) {
  bike.commands.addCommands({
    commands: {
      'due:set': setDue,
      'due:clear': clearDue,
    },
  })

  bike.badge('due', {
    where: '.@due',
    inputs: { due: '@due' },
    // Relative labels depend on the wall clock, not just the row's value —
    // tick supplies env.now so "Tomorrow" rolls over to "Today" at midnight.
    tick: true,
    render: (values, env) => {
      const value = values['due'] ?? ''
      const due = parseDue(value)
      if (!due) return null
      const now = new Date((env.now ?? 0) * 1000)
      const dayDiff = dayDiffFromToday(due.date, now)
      // Urgency tint: due today = red, due tomorrow = orange, else the
      // row's inherited color.
      const color = dayDiff === 0 ? Color.systemRed() : dayDiff === 1 ? Color.systemOrange() : env.color
      return {
        // A rounded-border tag; color, size, and radius tuned to sit beside
        // the priority badge's `N.square` symbol (hierarchical env.color at
        // 0.6).
        image: Image.fromText(new Text(dueLabel(due, now), env.font.withScale(0.65), color.alphaSet(0.8)))
          .withBackground({
            stroke: color.alphaSet(0.3),
            strokeWidth: 1,
            cornerRadius: 2,
            padding: new Insets(0.5, 4, 1.5, 4),
          }),
        items: [
          { kind: 'header', title: 'Due' },
          { kind: 'date', id: 'due', label: '', value, time: due.hasTime, display: 'calendar' },
          { kind: 'toggle', id: 'time', title: 'Include Time', value: due.hasTime },
          { kind: 'separator' },
          { kind: 'action', id: 'filter-today', title: 'Due Today' },
          { kind: 'action', id: 'filter-tomorrow', title: 'Due Tomorrow' },
          { kind: 'action', id: 'filter-week', title: 'Due This Week' },
          { kind: 'separator' },
          { kind: 'command', command: 'due:clear', title: 'Clear Due' },
        ],
      }
    },
    onChange: (id, value, { editor, row }) => {
      if (id === 'due') {
        editor.outline.transaction({ label: 'Set Due' }, () => {
          row.setAttribute('due', value)
        })
      } else if (id === 'time') {
        const due = parseDue(row.getAttribute('due') ?? '')
        if (!due) return
        editor.outline.transaction({ label: 'Set Due' }, () => {
          if (value === 'true') {
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
        editor.filter = '//@due >=[d] today() and @due <[d] today() + days(1)'
      } else if (id === 'filter-tomorrow') {
        editor.filter = '//@due >=[d] today() + days(1) and @due <[d] today() + days(2)'
      } else if (id === 'filter-week') {
        editor.filter = '//@due >=[d] start-of-week(0) and @due <[d] start-of-week(1)'
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

interface DueValue {
  date: Date
  hasTime: boolean
}

// `new Date('YYYY-MM-DD')` parses as UTC midnight, shifting the day in
// western timezones — date-only values are built from local components,
// matching outline-path date() semantics (bare date = local midnight).
function parseDue(value: string): DueValue | null {
  if (!value) return null
  if (value.includes('T')) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : { date, hasTime: true }
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { date: new Date(+match[1], +match[2] - 1, +match[3]), hasTime: false }
}

function serializeDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000)
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
  if (hasTime) {
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
