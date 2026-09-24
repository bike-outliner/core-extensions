/**
 * Pure helpers for the calendar's date attributes: query paths, day
 * bucketing, and mark/agenda labels shared by Calendar.tsx, Agenda.tsx and
 * app/main.ts.
 *
 * The calendar shows every `type: 'date'` attribute except those with
 * `metadata: { calendar: false }` (`done`). `bike.observeAttributes` is
 * app-only, so the app pushes the list to the DOM over CalendarProtocol and
 * every function here takes the names as a parameter.
 *
 * Kept free of React, the session API and imports so app, DOM and tests can
 * all import it; row and attribute-info shapes are structural stand-ins.
 */

export interface DateRow {
  attributes?: Record<string, string>
  text: { string: string }[]
}

export interface DateValue {
  date: Date
  hasTime: boolean
}

export interface DateAttribute {
  /** OutlinePath-safe, see isSafeAttributeName. */
  name: string
  title: string
}

/** One (row, attribute) placement; a row with both `start` and `due` yields two hits. */
export interface DateHit<R extends DateRow = DateRow> {
  row: R
  attribute: string
  value: DateValue
}

export interface AttributeInfoLike {
  name: string
  title: string
  type: string
  metadata?: Record<string, unknown>
}

/** Parses `YYYY-MM-DD` (local day) or a timed ISO-8601 value; null otherwise, including `''`. */
export function parseDateValue(value: string): DateValue | null {
  return bike.decodeValue('date', value) ?? null
}

/** Local day as `YYYY-MM-DD`: the bucket key and also the wire form of a date-only value. */
export function dayKey(date: Date): string {
  return bike.encodeValue('date', date)!
}

/** Start of the local day `n` days after `now`'s day. */
export function addDays(now: Date, n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
}

/** Whole local days from `now`'s day to `date`'s. */
export function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86400000)
}

/** Done or canceled; the row-object copy of `closed()` (calendar.bkext bundles separately). */
export function isClosed(row: DateRow): boolean {
  const status = row.attributes?.['status']
  return status === 'done' || status === 'canceled'
}

/** Urgency at day granularity, all a day tile can know. */
export type DayUrgency = 'urgent' | 'soon' | 'later'

/** Urgency of open work due `dayDiff` days from today; callers exclude done rows first. */
export function dayUrgency(dayDiff: number): DayUrgency {
  return dayDiff <= 0 ? 'urgent' : dayDiff === 1 ? 'soon' : 'later'
}

/**
 * Item-granularity urgency: adds `overdue` for a passed deadline (an earlier
 * day, or a timed due behind `now`). A date-only due today stays urgent all day.
 */
export type DueUrgency = 'overdue' | DayUrgency

export function dueUrgency(due: DateValue, now: Date): DueUrgency {
  const dayDiff = dayDiffFromToday(due.date, now)
  if (dayDiff < 0 || (due.hasTime && due.date.getTime() < now.getTime())) return 'overdue'
  return dayUrgency(dayDiff)
}

/** The only attribute with deadline urgency; explicit so a new date attribute can't turn the calendar red. */
export const URGENCY_ATTRIBUTE = 'due'

/**
 * Whether `name` can be interpolated into an OutlinePath as `@name`. The
 * registry doesn't enforce the path grammar and there's no escape syntax,
 * so unsafe names are dropped.
 */
export function isSafeAttributeName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)
}

/** Calendar-visible date attributes of an `observeAttributes` snapshot, in registry order. */
export function dateAttributesFrom(infos: readonly AttributeInfoLike[]): DateAttribute[] {
  return infos
    .filter(
      (info) =>
        info.type === 'date' && info.metadata?.['calendar'] !== false && isSafeAttributeName(info.name)
    )
    .map(({ name, title }) => ({ name, title }))
}

/** Matches nothing; the zero-clause fallback. */
export const NEVER_MATCH = '//@id = ""'

/**
 * Or-chained half-open range predicate over every named date attribute.
 * `[d]` compares raw timestamps, so even a single day must be a range:
 * `=[d]` would miss timed items. Null for zero attributes (avoids `//()`).
 */
export function dateRangeClause(
  names: readonly string[],
  start: Date,
  endExclusive: Date
): string | null {
  if (names.length === 0) return null
  const startKey = dayKey(start)
  const endKey = dayKey(endExclusive)
  return names.map((name) => `(@${name} >=[d] "${startKey}" and @${name} <[d] "${endKey}")`).join(' or ')
}

/** Rows dated inside `range` plus today, since the agenda falls back to Today. */
export function dateQueryPath(
  names: readonly string[],
  range: { start: Date; end: Date },
  today: Date
): string {
  return joinPredicates(dateClauses(names, range, today))
}

/**
 * dateQueryPath plus an id match for every day in `range` (inlined
 * protocols.dayIdFromDate), so one query drives both kinds of mark.
 * Built from the clause list so NEVER_MATCH isn't spliced in.
 */
export function calendarQueryPath(
  names: readonly string[],
  range: { start: Date; end: Date },
  today: Date
): string {
  const clauses = dateClauses(names, range, today)
  for (let d = new Date(range.start.getTime()); d < range.end; d = addDays(d, 1)) {
    clauses.push(`@id = "${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}"`)
  }
  return joinPredicates(clauses)
}

/**
 * Buckets rows by the local day of each date. `names` drives the scan, not
 * the rows' attribute maps, so excluded attributes never place a row.
 * Same-day `start` and `due` give two hits in one bucket.
 */
export function bucketByDay<R extends DateRow>(
  rows: readonly R[] | undefined,
  names: readonly string[]
): Map<string, DateHit<R>[]> {
  const buckets = new Map<string, DateHit<R>[]>()
  for (const row of rows ?? []) {
    for (const attribute of names) {
      const value = parseDateValue(row.attributes?.[attribute] ?? '')
      if (!value) continue
      const key = dayKey(value.date)
      const hit: DateHit<R> = { row, attribute, value }
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(hit)
      } else {
        buckets.set(key, [hit])
      }
    }
  }
  return buckets
}

export type DayMarkVariant = DayUrgency | 'done'

/**
 * A day mark's tint: urgency only for open deadline hits, neutral for days
 * placed only by other dates, `done` when every row is closed.
 */
export function dayMarkVariant(hits: readonly DateHit[], dayDiff: number): DayMarkVariant {
  const open = hits.filter((hit) => !isClosed(hit.row))
  if (open.length === 0) return 'done'
  if (!open.some((hit) => hit.attribute === URGENCY_ATTRIBUTE)) return 'later'
  return dayUrgency(dayDiff)
}

/** A day mark's tooltip, e.g. "2 Due, 1 Start". */
export function dayMarkTooltip(
  hits: readonly DateHit[],
  titleByName: ReadonlyMap<string, string>
): string {
  const counts = new Map<string, number>()
  for (const hit of hits) {
    counts.set(hit.attribute, (counts.get(hit.attribute) ?? 0) + 1)
  }
  return [...counts]
    .map(([attribute, count]) => `${count} ${titleByName.get(attribute) ?? attribute}`)
    .join(', ')
}

/** All runs concatenated, not just the first. */
export function rowDisplayText(row: DateRow): string {
  return row.text.map((run) => run.string).join('')
}

/** Date-only items first, then timed items by time; stable sort keeps bucket order for ties. */
export function sortAgendaHits<H extends DateHit<DateRow>>(hits: readonly H[]): H[] {
  const sortKey = (hit: H): number => (hit.value.hasTime ? hit.value.date.getTime() : -1)
  return [...hits].sort((a, b) => sortKey(a) - sortKey(b))
}

/** Local time label for a timed item; null for date-only or exactly midnight (matches the due badge). */
export function agendaTimeLabel(value: DateValue, locale?: string): string | null {
  if (!value.hasTime) return null
  if (value.date.getHours() === 0 && value.date.getMinutes() === 0) return null
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(value.date)
}

/** The month padded a week each side so neighboring-month tiles get marks; `end` is exclusive. */
export function visibleRange(activeStartDate: Date): { start: Date; end: Date } {
  const year = activeStartDate.getFullYear()
  const month = activeStartDate.getMonth()
  return {
    start: new Date(year, month, 1 - 7),
    end: new Date(year, month + 1, 1 + 7),
  }
}

function dateClauses(
  names: readonly string[],
  range: { start: Date; end: Date },
  today: Date
): string[] {
  const clauses: string[] = []
  const inRange = dateRangeClause(names, range.start, range.end)
  if (inRange) clauses.push(inRange)
  const onToday = dateRangeClause(names, today, addDays(today, 1))
  if (onToday) clauses.push(onToday)
  return clauses
}

function joinPredicates(clauses: readonly string[]): string {
  return clauses.length > 0 ? `//${clauses.join(' or ')}` : NEVER_MATCH
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
