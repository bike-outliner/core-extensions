// Define the messaging protocol between app and DOM contexts here.
// This file is typechecked in both contexts, so app/main.ts and DOM
// scripts can import from it to share a single protocol definition.

import { DOMProtocol } from 'bike/core'

export const dateIdPattern = /^\d{4}\/\d{2}\/\d{2}$/

export function isDayId(id: string): boolean {
  if (!dateIdPattern.test(id)) return false
  const day = Number(id.split('/')[2])
  return day > 0
}

export const calendarDefaults = {
  yearNameFormat: '{ yyyy }',
  monthNameFormat: '{"year":"numeric","month":"long"}',
  dayNameFormat: '{"dateStyle":"long"}',
  yearEnabled: true,
  monthEnabled: true,
  showWeekNumbers: true,
}

// --- Field rendering (shared by row generation and the settings preview) ---

/**
 * Format a date from a `{ … }` span (braces included). The span is parsed as
 * JSON: a valid object is used as `Intl.DateTimeFormat` options; otherwise the
 * text inside the braces is used as a date-fns pattern. So `{"dateStyle":"long"}`
 * formats via Intl, and `{ yyyy }` formats `yyyy` via date-fns.
 */
function formatSpec(date: Date, span: unknown): string {
  // Legacy: a stored Intl options object (older versions stored objects).
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
 * Neutralize a leading markdown block marker in formatted date *data* so it
 * can't turn a generated row into a list/heading/quote. Only the date span is
 * escaped — author markup around it (e.g. a leading `# `) is left intact. The
 * motivating case: a locale whose long date style starts with the day number,
 * like German `28. Mai 2026`, whose `28. ` reads as an ordered-list marker.
 * A backslash escape is harmless if the span ends up mid-line.
 */
function escapeLeadingBlockMarker(s: string): string {
  // Ordered list: digits + "." or ")" followed by a space or end of line.
  const ordered = s.match(/^(\s*)(\d+)([.)])(?=\s|$)/)
  if (ordered) {
    return `${ordered[1]}${ordered[2]}\\${ordered[3]}${s.slice(ordered[0].length)}`
  }
  // Heading "#", quote ">", or bullet "-" / "*" / "+".
  const block = s.match(/^(\s*)([#>+*-])(?=\s|$)/)
  if (block) {
    return `${block[1]}\\${block[2]}${s.slice(block[0].length)}`
  }
  return s
}

/**
 * Substitute the formatted date into a field value, keeping surrounding text
 * and markdown. The date lives in a single `{ … }` span — `{ yyyy }` (date-fns)
 * or `{"dateStyle":"long"}` (JSON Intl options). A field with no `{ … }` span is
 * treated as literal text (no date).
 *
 * Pass `{ escapeMarkdown: true }` when the result is inserted as markdown (row
 * generation), so the formatted date can't inject block structure; leave it off
 * for display (the settings preview), which wants the date verbatim.
 */
export function substituteDate(
  date: Date,
  rawValue: unknown,
  options: { escapeMarkdown?: boolean } = {}
): string {
  const escape = options.escapeMarkdown ? escapeLeadingBlockMarker : (s: string) => s
  // Legacy: a stored Intl options object — the whole value is the date.
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return escape(formatSpec(date, rawValue))
  }
  const field = String(rawValue ?? '')
  const open = field.indexOf('{')
  const close = field.lastIndexOf('}')
  if (open < 0 || close <= open) {
    return field
  }
  const formatted = escape(formatSpec(date, field.slice(open, close + 1)))
  return field.slice(0, open) + formatted + field.slice(close + 1)
}

export interface CalendarProtocol extends DOMProtocol {
  toDOM:
    | { type: 'selectDate'; date: string }
    | { type: 'clearSelection' }
  toApp: { type: 'dateChange'; date: string }
}
