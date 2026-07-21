import { AttributeParseResult, AttributeValue } from 'bike/app'

// Date and duration helpers behind the default attribute shapes (due, start,
// estimate) registered in attributes.ts. This is the app-context home of the
// `date` serialization convention: `YYYY-MM-DD` built from LOCAL calendar
// components, or a full ISO-8601 UTC timestamp when timed. calendar.bkext
// imports the label formatting from here for its due badge; the calendar
// inspector's DOM context keeps its own copies of the tiny primitives
// (dom/due-marks.ts) — no `bike` global there.

export interface DateValue {
  date: Date
  hasTime: boolean
}

/**
 * Parse a stored `date` attribute value: `YYYY-MM-DD` (local calendar date)
 * or a full ISO-8601 timestamp when timed. A date-only value must be built
 * from LOCAL components (`new Date('YYYY-MM-DD')` parses as UTC midnight,
 * shifting the day west of Greenwich); a timed value carries its own zone
 * and lands on whatever LOCAL day it falls in.
 */
export function parseDateValue(value: string): DateValue | null {
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
 * Local calendar day of `date` as `YYYY-MM-DD` — the serialization of a
 * date-only attribute value.
 */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Start of the local day `n` days after `now`'s day. */
export function addDays(now: Date, n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
}

/** Whole local days from the start of `now`'s day to the start of `date`'s. */
export function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000)
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Parse free-typed date input (the completion popup's `@due:` / `^` text)
 * into a local calendar day, or null when the text doesn't resolve.
 * Keywords: today/tod, tomorrow/tom, yesterday, a weekday name or unique
 * prefix ≥2 chars ("fri" → the NEXT Friday, never today — `today` covers
 * that), "next <weekday>" (the one after), `+3d` / `+2w`, and `YYYY-MM-DD`
 * (LOCAL components — the parseDateValue caveat). English keywords; display
 * stays locale-aware via dateLabel.
 */
export function parseDateInput(text: string, now: Date): Date | null {
  const input = text.trim().toLowerCase()
  if (!input) return null
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

/**
 * Completion value suggestions for a date attribute: Today/Tomorrow, then
 * the rest of the coming week by weekday — the popup fuzzy-filters, so
 * "fri" finds "Friday (Jul 24)". Built fresh per popup so the days roll
 * over.
 */
export function dateSuggestions(): AttributeValue[] {
  const now = new Date()
  const f = dateFormatters()
  const suggestions: AttributeValue[] = [
    { name: 'Today', value: dayKey(now) },
    { name: 'Tomorrow', value: dayKey(addDays(now, 1)) },
  ]
  for (let i = 2; i <= 6; i++) {
    const date = addDays(now, i)
    suggestions.push({ name: `${f.weekdayLong.format(date)} (${f.shortDate.format(date)})`, value: dayKey(date) })
  }
  return suggestions
}

/** Free text → a committed date-only value, for a date attribute's `parse`. */
export function parseDateAttribute(text: string): AttributeParseResult | undefined {
  const now = new Date()
  const parsed = parseDateInput(text, now)
  if (parsed === null) return undefined
  return { value: dayKey(parsed), label: dateLabel({ date: parsed, hasTime: false }, now) }
}

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(m|h|d|min|mins|minutes?|hours?|hrs?|days?)?$/i

/**
 * Free text → a canonical duration value (`<n><unit>`, unit m / h / d),
 * for a duration attribute's `parse`. A bare number is minutes.
 */
export function parseDurationAttribute(text: string): AttributeParseResult | undefined {
  const match = text.trim().match(DURATION_RE)
  if (!match) return undefined
  const n = parseFloat(match[1])
  if (!Number.isFinite(n) || n <= 0) return undefined
  const unit = (match[2] ?? 'm')[0].toLowerCase()
  const unitName = unit === 'm' ? 'minute' : unit === 'h' ? 'hour' : 'day'
  return { value: `${n}${unit}`, label: `${n} ${unitName}${n === 1 ? '' : 's'}` }
}

// Display text is localized through Intl with bike.systemLocale. Formatters
// are cached because the due badge's render runs every tick.
let formatters:
  | {
      relative: Intl.RelativeTimeFormat
      weekday: Intl.DateTimeFormat
      weekdayLong: Intl.DateTimeFormat
      shortDate: Intl.DateTimeFormat
      shortDateYear: Intl.DateTimeFormat
      time: Intl.DateTimeFormat
    }
  | undefined

function dateFormatters() {
  formatters ??= {
    relative: new Intl.RelativeTimeFormat(bike.systemLocale, { numeric: 'auto' }),
    weekday: new Intl.DateTimeFormat(bike.systemLocale, { weekday: 'short' }),
    weekdayLong: new Intl.DateTimeFormat(bike.systemLocale, { weekday: 'long' }),
    shortDate: new Intl.DateTimeFormat(bike.systemLocale, { month: 'short', day: 'numeric' }),
    shortDateYear: new Intl.DateTimeFormat(bike.systemLocale, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: new Intl.DateTimeFormat(bike.systemLocale, { hour: 'numeric', minute: '2-digit' }),
  }
  return formatters
}

/**
 * Short display label for a date value: relative when within a day
 * ("Today"), weekday within the week, short date beyond (year included only
 * when it differs from `now`'s).
 */
export function dateLabel(value: DateValue, now: Date): string {
  const { date, hasTime } = value
  const f = dateFormatters()
  const dayDiff = dayDiffFromToday(date, now)
  let label: string
  if (Math.abs(dayDiff) <= 1) {
    label = capitalize(f.relative.format(dayDiff, 'day'))
  } else if (dayDiff >= 2 && dayDiff <= 6) {
    label = f.weekday.format(date)
  } else {
    label = (date.getFullYear() === now.getFullYear() ? f.shortDate : f.shortDateYear).format(date)
  }
  // A timed value at exactly midnight (12am) shows no time component — the
  // day alone reads cleaner than a redundant "12:00 AM".
  if (hasTime && (date.getHours() !== 0 || date.getMinutes() !== 0)) {
    label += ` ${f.time.format(date)}`
  }
  return label
}

// Intl.RelativeTimeFormat returns mid-sentence casing ("tomorrow"); the
// labels are standalone.
function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(bike.systemLocale) + s.slice(1)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
