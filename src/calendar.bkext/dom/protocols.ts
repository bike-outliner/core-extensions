// App/DOM messaging protocol; typechecked in both contexts.

import { DOMProtocol } from 'bike/core'
import { DateAttribute } from './date-marks'

/**
 * Calendar row ids are `YYYY/MM/DD`, `00` marking an unused slot: `2026/04/27`
 * day, `2026/04/00` month, `2026/00/00` year, `2026/00/32` week ordinal.
 */
export const dateIdPattern = /^\d{4}\/\d{2}\/\d{2}$/

export function isDayId(id: string): boolean {
  if (!dateIdPattern.test(id)) return false
  const [, month, day] = id.split('/').map(Number)
  // Month matters: without it a week id's ordinal reads as a day number.
  return month > 0 && day > 0
}

export function isWeekId(id: string): boolean {
  if (!dateIdPattern.test(id)) return false
  const [, month, day] = id.split('/').map(Number)
  return month === 0 && day > 0
}

/** Zero-padded so lexical order is chronological; must match app/util.ts getDateComponents. */
export function dayIdFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** JS day number (0 = Sunday); normalized like the inspector grid so week rows agree with it. */
export function weekStartsOn(): number {
  return bike.systemFirstWeekday === 0 ? 0 : bike.systemFirstWeekday === 6 ? 6 : 1
}

export function startOfWeek(date: Date): Date {
  const back = (date.getDay() - weekStartsOn() + 7) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back)
}

/** `YYYY/00/WW`: year of the week's first day and its 1…53 ordinal in that year. */
export function weekIdFromDate(date: Date): string {
  const start = startOfWeek(date)
  const jan1 = new Date(start.getFullYear(), 0, 1)
  // Rounded, not floored, for DST shifts.
  const dayOfYear = Math.round((start.getTime() - jan1.getTime()) / 86_400_000) + 1
  const ordinal = Math.floor((dayOfYear - 1) / 7) + 1
  return `${start.getFullYear()}/00/${String(ordinal).padStart(2, '0')}`
}

export const calendarDefaults = {
  yearNameFormat: '{ yyyy }',
  monthNameFormat: '{"year":"numeric","month":"long"}',
  // `ww`, not ISO `II`, which is off by one week on Sunday-start Macs.
  // `yyyy`, not `Y`, so it agrees with the ancestor Year row across January 1.
  weekNameFormat: 'Week { ww }, { yyyy }',
  dayNameFormat: '{"dateStyle":"long"}',
  yearEnabled: true,
  monthEnabled: true,
  weekEnabled: false,
  showWeekNumbers: true,
  // Only affects where new rows go.
  newestFirst: false,
}

// --- Field rendering (shared by row generation and the settings preview) ---

/** Formats a `{ … }` span: JSON object as Intl options, else inner text as a date-fns pattern. */
function formatSpec(date: Date, span: unknown): string {
  // Legacy stored Intl options object.
  if (span && typeof span === 'object' && !Array.isArray(span)) {
    return new Intl.DateTimeFormat(bike.systemLocale, span as Intl.DateTimeFormatOptions).format(date)
  }
  const s = String(span ?? '').trim()
  try {
    const parsed = JSON.parse(s)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return new Intl.DateTimeFormat(bike.systemLocale, parsed as Intl.DateTimeFormatOptions).format(date)
    }
  } catch {
    // not JSON — treat the text inside the braces as a date-fns pattern
  }
  const inner = (s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s).trim()
  if (inner === '') return date.toLocaleDateString(bike.systemLocale)
  return bike.formatDate(date, inner)
}

/**
 * Escapes a leading markdown block marker in a formatted date span, e.g.
 * German `28. Mai 2026` reading as an ordered list.
 */
function escapeLeadingBlockMarker(s: string): string {
  const ordered = s.match(/^(\s*)(\d+)([.)])(?=\s|$)/)
  if (ordered) {
    return `${ordered[1]}${ordered[2]}\\${ordered[3]}${s.slice(ordered[0].length)}`
  }
  const block = s.match(/^(\s*)([#>+*-])(?=\s|$)/)
  if (block) {
    return `${block[1]}\\${block[2]}${s.slice(block[0].length)}`
  }
  return s
}

/**
 * Formats each `{ … }` span in a field, keeping surrounding text. Spans run to
 * the first `}`, so Intl options must be flat. Use `escapeMarkdown` when the
 * result is inserted as markdown.
 */
export function substituteDate(
  date: Date,
  rawValue: unknown,
  options: { escapeMarkdown?: boolean } = {}
): string {
  const escape = options.escapeMarkdown ? escapeLeadingBlockMarker : (s: string) => s
  // Legacy stored Intl options object.
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return escape(formatSpec(date, rawValue))
  }
  const field = String(rawValue ?? '')
  return field.replace(/\{[^}]*\}/g, (span) => escape(formatSpec(date, span)))
}

/** 'all' = day and dated rows, 'dates' (⌘) = dated rows, 'days' (⌥) = day rows. */
export type CalendarSelectMode = 'all' | 'dates' | 'days'

export interface CalendarProtocol extends DOMProtocol {
  toDOM:
    | { type: 'selectDate'; date: string }
    | { type: 'clearSelection' }
    /** Sent in reply to `ready` and whenever the attribute registry changes. */
    | { type: 'dateAttributes'; attributes: DateAttribute[] }
  // `showRange` only filters, never creates rows; `start`/`end` are inclusive.
  // `live` (mid-drag) skips pushing a history step. `openDay`/`openRange`
  // find-or-create day rows, clear the filter and focus the editor.
  toApp:
    | { type: 'showRange'; start: string; end: string; mode?: CalendarSelectMode; live?: boolean }
    | { type: 'openDay'; date: string }
    | { type: 'openRange'; start: string; end: string }
    /**
     * Panel mounted; reply with `dateAttributes`. A pull because app→DOM
     * messages are dropped before the DOM sets onmessage, while DOM→app queue.
     */
    | { type: 'ready' }
}
