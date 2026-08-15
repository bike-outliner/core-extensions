/**
 * Pure helpers behind the calendar's DATE ATTRIBUTES: the query paths, the
 * day bucketing, and the mark/agenda labels shared by the calendar
 * inspector (dom/Calendar.tsx), the agenda (dom/Agenda.tsx), and the range
 * filter (app/main.ts).
 *
 * The calendar shows every attribute registered with `type: 'date'` — `due`
 * today, whatever an extension adds tomorrow — EXCEPT those
 * declaring `metadata: { calendar: false }` (that's `done`: a completion
 * stamp is history, not schedule). The attribute set is discovered at
 * runtime through `bike.observeAttributes`, which exists only in the APP
 * context, so the app pushes the resolved list to the DOM panels over
 * CalendarProtocol and every function here takes the names as a parameter.
 *
 * Deliberately free of React, the session API, and imports so all three
 * contexts — and the tests, typechecked in the app project where the
 * DOM-only ambient Session* types don't exist — can import them. Row shapes
 * and attribute-info shapes are structural stand-ins that the real
 * SessionRow / AttributeInfo satisfy. Wire encoding/decoding goes through
 * `bike.encodeValue`/`bike.decodeValue` — declared on BikeUtilityGlobals, so
 * the ambient `bike` satisfies BOTH the app and DOM typecheck projects, and
 * present at runtime everywhere this runs (tests run in the app context).
 */

/** The structural subset of SessionRow these helpers read. */
export interface DateRow {
  attributes?: Record<string, string>
  text: { string: string }[]
}

export interface DateValue {
  date: Date
  hasTime: boolean
}

/** One calendar-visible date attribute, as the calendar consumes it. */
export interface DateAttribute {
  /** Registered name — guaranteed OutlinePath-safe, see isSafeAttributeName. */
  name: string
  /** Registry title ("Due", "Start") for agenda labels and tile tooltips. */
  title: string
}

/**
 * One (row, attribute) placement. A row carrying both `start` and `due`
 * yields TWO hits, in two different day buckets — this pair, not the row,
 * is the unit the calendar buckets, sorts, and labels.
 */
export interface DateHit<R extends DateRow = DateRow> {
  row: R
  /** The date attribute that placed this row on this day. */
  attribute: string
  value: DateValue
}

/**
 * The structural subset of `AttributeInfo` that dateAttributesFrom reads —
 * spelled out here rather than imported so this module stays free of
 * app-context types.
 */
export interface AttributeInfoLike {
  name: string
  title: string
  type: string
  metadata?: Record<string, unknown>
}

/**
 * Parse a date attribute value through the shared wire codec: `YYYY-MM-DD`
 * (LOCAL calendar date, so the day never shifts across zones) or a full
 * ISO-8601 timestamp when timed — a timed value carries its own zone and
 * lands on whatever LOCAL day it falls in. Null for anything else,
 * including the valueless `''`. (`DateValue` above is structurally the
 * codec's decoded-date shape.)
 */
export function parseDateValue(value: string): DateValue | null {
  return bike.decodeValue('date', value) ?? null
}

/**
 * Local calendar day of `date` as `YYYY-MM-DD` via the shared wire codec —
 * the bucket key, and DELIBERATELY also the wire serialization of a
 * date-only value (a valid Date always encodes, hence the `!`).
 */
export function dayKey(date: Date): string {
  return bike.encodeValue('date', date)!
}

/** Start of the local day `n` days after `now`'s day. */
export function addDays(now: Date, n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
}

/** Whole local days from the start of `now`'s day to the start of `date`'s. */
export function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86400000)
}

/**
 * Whether a row is off the list — done or canceled. Paths say `closed()`;
 * this is the copy for code holding a row object, and calendar.bkext bundles
 * separately from bike.bkext so it needs its own.
 *
 * Orthogonal to which date attributes the calendar shows: this reads a row
 * the query already returned, so `status` staying OFF the calendar doesn't
 * stop closed rows from being dimmed.
 */
export function isClosed(row: DateRow): boolean {
  const status = row.attributes?.['status']
  return status === 'done' || status === 'canceled'
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
 * The attribute whose dates carry DEADLINE urgency. "Urgent" means a
 * deadline passed — a `start` in the past is not a fire, and neither is
 * whatever date attribute an extension registers next. Named explicitly
 * here rather than inferred from the type, so registering a date attribute
 * can never silently turn the calendar red.
 */
export const URGENCY_ATTRIBUTE = 'due'

/**
 * Whether `name` can be interpolated into an OutlinePath as `@name`. The
 * registry does NOT constrain names to the path grammar — it only rejects
 * reserved ones — so a definition like `@my attr` would corrupt every
 * generated query. Such names are DROPPED, not escaped (there is no escape
 * syntax). A conservative subset of the path grammar's XML name rule.
 */
export function isSafeAttributeName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)
}

/**
 * The calendar-visible date attributes of an `observeAttributes` snapshot,
 * in registry order: every `type: 'date'` definition that hasn't opted out
 * with `metadata: { calendar: false }` and whose name is path-safe.
 */
export function dateAttributesFrom(infos: readonly AttributeInfoLike[]): DateAttribute[] {
  return infos
    .filter(
      (info) =>
        info.type === 'date' && info.metadata?.['calendar'] !== false && isSafeAttributeName(info.name)
    )
    .map(({ name, title }) => ({ name, title }))
}

/** A path that deliberately matches nothing — the zero-clause fallback. */
export const NEVER_MATCH = '//@id = ""'

/**
 * The or-chained half-open range predicate over every named date
 * attribute: `(@due >=[d] "s" and @due <[d] "e") or (@start >=[d] …)`.
 * `endExclusive` is EXCLUSIVE (pairs with a `<[d]` compare). Bare date
 * literals resolve to local midnight, matching dayKey's local-day
 * semantics; the `[d]` modifier makes date-only and timed values compare as
 * raw timestamps (no day truncation), so a single day is a half-open range
 * too, not an `=` compare — `=[d]` would miss timed items.
 *
 * Null for zero attributes, so callers omit the clause entirely rather than
 * emit a malformed `//()`.
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

/**
 * Outline path matching rows dated inside `range`, plus rows dated on
 * `today`'s day — the agenda falls back to Today when no date is selected,
 * so today's rows must arrive even when the calendar is paged to a distant
 * month.
 */
export function dateQueryPath(
  names: readonly string[],
  range: { start: Date; end: Date },
  today: Date
): string {
  return joinPredicates(dateClauses(names, range, today))
}

/**
 * dateQueryPath plus an id match for every day in `range`, so ONE query
 * drives both the calendar's date marks and its has-day-row marks. Day-row
 * ids are `YYYY/MM/DD` (see protocols.dayIdFromDate — formatted inline here
 * to keep this module import-free).
 *
 * Built from the same clause list rather than concatenated onto
 * dateQueryPath's output: with no date attributes that would splice in
 * NEVER_MATCH's dead `@id = ""` term ahead of the real day ids.
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
 * Bucket query-result rows by the local day each of their dates falls on.
 * `names` drives the scan — NOT the rows' own attribute maps — so an
 * attribute the calendar excludes can never place a row, and the query's
 * or-chain can't drift from what gets bucketed. Rows iterate in document
 * order (the query's order); within a row, attributes iterate in registry
 * order. Unparseable values are skipped.
 *
 * A row whose `start` and `due` land on the same day contributes TWO hits
 * to that one bucket — correct, and what lets the tooltip and agenda name
 * both.
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

export type DayMarkVariant = DueUrgency | 'done'

/**
 * The tint for a day's mark. Urgency belongs to OPEN work under the
 * deadline attribute: red when due today or overdue (an overdue item is a
 * fire whether or not the day is past), orange when due tomorrow. A day
 * placed only by non-deadline dates (a `start`) draws the neutral accent,
 * and a day whose rows are ALL closed is history, not a fire.
 */
export function dayMarkVariant(hits: readonly DateHit[], dayDiff: number): DayMarkVariant {
  const open = hits.filter((hit) => !isClosed(hit.row))
  if (open.length === 0) return 'done'
  if (!open.some((hit) => hit.attribute === URGENCY_ATTRIBUTE)) return 'later'
  return dueUrgency(dayDiff)
}

/**
 * A day mark's tooltip — "2 Due, 1 Start". Tiles are too small for numbers,
 * and with several date attributes in play the count alone wouldn't say
 * what put the rows there. Attributes appear in first-hit (registry) order.
 */
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

/** A row's plain display text — all runs concatenated, not just the first. */
export function rowDisplayText(row: DateRow): string {
  return row.text.map((run) => run.string).join('')
}

/**
 * Agenda display order for one day's hits: date-only items first (calendar
 * apps put all-day entries on top), then timed items by time ascending.
 * Bucket order (document order, then registry order within a row) breaks
 * ties — Array.prototype.sort is stable.
 */
export function sortAgendaHits<H extends DateHit<DateRow>>(hits: readonly H[]): H[] {
  const sortKey = (hit: H): number => (hit.value.hasTime ? hit.value.date.getTime() : -1)
  return [...hits].sort((a, b) => sortKey(a) - sortKey(b))
}

/**
 * The local wall-clock time to lead a timed agenda item with, or null for a
 * date-only value. A timed value at exactly midnight also gets null,
 * matching the due badge (the bare day reads cleaner than a redundant
 * "12:00 AM").
 */
export function agendaTimeLabel(value: DateValue, locale?: string): string | null {
  if (!value.hasTime) return null
  if (value.date.getHours() === 0 && value.date.getMinutes() === 0) return null
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(value.date)
}

/**
 * The date range worth querying while `activeStartDate`'s month is
 * displayed: the month padded by a week on both sides, so react-calendar's
 * neighboring-month tiles get marks too. `end` is EXCLUSIVE.
 */
export function visibleRange(activeStartDate: Date): { start: Date; end: Date } {
  const year = activeStartDate.getFullYear()
  const month = activeStartDate.getMonth()
  return {
    start: new Date(year, month, 1 - 7),
    end: new Date(year, month + 1, 1 + 7),
  }
}

/** The visible range's clause plus today's, dropping either when empty. */
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

/** One `//`-rooted or-chain, or a path matching nothing when there is none. */
function joinPredicates(clauses: readonly string[]): string {
  return clauses.length > 0 ? `//${clauses.join(' or ')}` : NEVER_MATCH
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
