/**
 * Pure helpers behind the `due` attribute: parsing/serialization shared by
 * the due badge (app/due.ts) and the calendar inspector's day marks and
 * agenda list (dom/Calendar.tsx). Deliberately free of React, the session
 * API, and `bike` globals so both contexts — and the tests, typechecked in
 * the app project where the DOM-only ambient Session* types don't exist —
 * can import them; row shapes are structural stand-ins that a real
 * SessionRow satisfies.
 */

/** The structural subset of SessionRow these helpers read. */
export interface DueRow {
  attributes?: Record<string, string>
  text: { string: string }[]
}

export interface DueValue {
  date: Date
  hasTime: boolean
}

/**
 * Parse a `due` attribute value: `YYYY-MM-DD` (local calendar date) or a
 * full ISO-8601 timestamp when timed. Mirrors due.bkext's parseDue — see
 * the time-zone caveat at the top of its app/main.ts: a date-only value
 * must be built from LOCAL components (`new Date('YYYY-MM-DD')` parses as
 * UTC midnight, shifting the day west of Greenwich), while a timed value
 * carries its own zone and lands on whatever LOCAL day it falls in.
 */
export function parseDue(value: string): DueValue | null {
  if (!value) return null
  if (value.includes('T')) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : { date, hasTime: true }
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { date: new Date(+match[1], +match[2] - 1, +match[3]), hasTime: false }
}

/**
 * Local calendar day of `date` as `YYYY-MM-DD` — the bucket key, and the
 * serialization of a date-only due value.
 */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Parse free-typed due input (the completion popup's `@due:` / `^` text)
 * into a local calendar day, `'soon'` (a valueless due), or null when the
 * text doesn't resolve. Keywords: today/tod, tomorrow/tom, yesterday, soon,
 * a weekday name or unique prefix ≥2 chars ("fri" → the NEXT Friday, never
 * today — `today` covers that), "next <weekday>" (the one after), `+3d` /
 * `+2w`, and `YYYY-MM-DD` (LOCAL components — the parseDue caveat).
 * English keywords; display stays locale-aware via the caller's formatting.
 */
export function parseDueInput(text: string, now: Date): Date | 'soon' | null {
  const input = text.trim().toLowerCase()
  if (!input) return null
  if (input === 'soon') return 'soon'
  if (input === 'today' || input === 'tod') return addDays(now, 0)
  if (input === 'tomorrow' || input === 'tom') return addDays(now, 1)
  if (input === 'yesterday') return addDays(now, -1)

  const relative = input.match(/^\+(\d+)([dw])$/)
  if (relative) return addDays(now, +relative[1] * (relative[2] === 'w' ? 7 : 1))

  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const month = +iso[2]
    const day = +iso[3]
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return new Date(+iso[1], month - 1, day)
  }

  const next = input.startsWith('next ')
  const weekday = matchWeekday(next ? input.slice(5) : input)
  if (weekday != null) {
    let ahead = (weekday - now.getDay() + 7) % 7
    if (ahead === 0) ahead = 7
    if (next) ahead += 7
    return addDays(now, ahead)
  }
  return null
}

/** The weekday index a unique name prefix (≥2 chars) resolves to, or null. */
function matchWeekday(word: string): number | null {
  if (word.length < 2) return null
  const matches = WEEKDAYS.filter((name) => name.startsWith(word))
  return matches.length === 1 ? WEEKDAYS.indexOf(matches[0]) : null
}

/** Start of the local day `n` days after `now`'s day. */
export function addDays(now: Date, n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
}

/** Whole local days from the start of `now`'s day to the start of `date`'s. */
export function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000)
}

/**
 * Whether a row is checked off — the `done` attribute is present (its
 * value may legitimately be empty).
 */
export function isDone(row: DueRow): boolean {
  return row.attributes?.['done'] != null
}

export type DueUrgency = 'urgent' | 'soon' | 'later'

/**
 * Urgency of OPEN (not @done) work due `dayDiff` days from today: urgent
 * (red) when due today or any time before, soon (orange) when due
 * tomorrow. Done items carry no urgency — callers exclude them first (a
 * checked row's overdue date is history, not a fire).
 */
export function dueUrgency(dayDiff: number): DueUrgency {
  return dayDiff <= 0 ? 'urgent' : dayDiff === 1 ? 'soon' : 'later'
}

/**
 * The date range worth querying while `activeStartDate`'s month is
 * displayed: the month padded by a week on both sides, so react-calendar's
 * neighboring-month tiles get marks too. `end` is EXCLUSIVE (pairs with a
 * `<[d]` compare).
 */
export function visibleRange(activeStartDate: Date): { start: Date; end: Date } {
  const year = activeStartDate.getFullYear()
  const month = activeStartDate.getMonth()
  return {
    start: new Date(year, month, 1 - 7),
    end: new Date(year, month + 1, 1 + 7),
  }
}

/**
 * Outline path matching rows due inside `range`, plus rows due on `today`'s
 * day — the agenda falls back to Today when no date is selected, so today's
 * rows must arrive even when the calendar is paged to a distant month. Bare
 * date literals resolve to local midnight, matching dayKey's local-day
 * semantics; the `[d]` modifier makes date-only and timed `due` values
 * compare as raw timestamps (no day truncation), so today is a half-open
 * day range too, not an `=` compare — `=[d]` would miss timed items.
 */
export function dueQueryPath(range: { start: Date; end: Date }, today: Date): string {
  const dayAfterToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  return (
    `//(@due >=[d] "${dayKey(range.start)}" and @due <[d] "${dayKey(range.end)}")` +
    ` or (@due >=[d] "${dayKey(today)}" and @due <[d] "${dayKey(dayAfterToday)}")`
  )
}

/**
 * Bucket query-result rows by the local day their `due` falls on.
 * Rows without a parseable `due` are skipped. Insertion order (= document
 * order from the query) is preserved within each day.
 */
export function bucketByDay<R extends DueRow>(
  rows: readonly R[] | undefined
): Map<string, R[]> {
  const buckets = new Map<string, R[]>()
  for (const row of rows ?? []) {
    const due = parseDue(row.attributes?.['due'] ?? '')
    if (!due) continue
    const key = dayKey(due.date)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      buckets.set(key, [row])
    }
  }
  return buckets
}

/** A row's plain display text — all runs concatenated, not just the first. */
export function rowDisplayText(row: DueRow): string {
  return row.text.map((run) => run.string).join('')
}

/**
 * Agenda display order for one day's rows: date-only items first (calendar
 * apps put all-day entries on top), then timed items by time ascending.
 * Document order breaks ties — Array.prototype.sort is stable.
 */
export function sortAgendaRows<R extends DueRow>(rows: readonly R[]): R[] {
  const sortKey = (row: R): number => {
    const due = parseDue(row.attributes?.['due'] ?? '')
    if (!due || !due.hasTime) return -1
    return due.date.getTime()
  }
  return [...rows].sort((a, b) => sortKey(a) - sortKey(b))
}

/**
 * The local wall-clock time to lead a timed agenda item with, or null for
 * a date-only due. A timed due at exactly midnight also gets null,
 * matching the due badge (the bare day reads cleaner than a redundant
 * "12:00 AM").
 */
export function agendaTimeLabel(row: DueRow, locale?: string): string | null {
  const due = parseDue(row.attributes?.['due'] ?? '')
  if (!due || !due.hasTime) return null
  if (due.date.getHours() === 0 && due.date.getMinutes() === 0) return null
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(due.date)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
