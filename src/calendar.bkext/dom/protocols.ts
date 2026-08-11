// Define the messaging protocol between app and DOM contexts here.
// This file is typechecked in both contexts, so app/main.ts and DOM
// scripts can import from it to share a single protocol definition.

import { DOMProtocol } from 'bike/core'
import { DateAttribute } from './date-marks'

/**
 * Calendar row ids are `YYYY/MM/DD` with `00` meaning "this level doesn't use
 * that slot": `2026/04/27` a day, `2026/04/00` a month, `2026/00/00` a year.
 * Weeks take the one remaining shape — `2026/00/32`, month zeroed and the day
 * slot holding a week ordinal — so every level fits the same pattern.
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

/**
 * The persistent id of `date`'s day row (`YYYY/MM/DD`, zero-padded so lexical
 * order is chronological). Shared so the DOM's day-row existence checks key
 * exactly like the app's row generation (see app/util.ts getDateComponents).
 */
export function dayIdFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/**
 * The day a week starts on, as a JS day number (0 = Sunday). Normalizes the
 * system preference exactly the way the inspector grid does — Sunday and
 * Saturday starts are honored, anything else is ISO Monday — so generated week
 * rows always agree with the grid's week-number column.
 */
export function weekStartsOn(): number {
  return bike.systemFirstWeekday === 0 ? 0 : bike.systemFirstWeekday === 6 ? 6 : 1
}

/** The first day of `date`'s week, at local midnight. */
export function startOfWeek(date: Date): Date {
  const back = (date.getDay() - weekStartsOn() + 7) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back)
}

/**
 * The persistent id of `date`'s week row: `YYYY/00/WW`, where `YYYY` is the
 * year of the week's first day and `WW` its ordinal within that year.
 *
 * Week starts sit exactly seven days apart and a year's first one always lands
 * in Jan 1–7, so the ordinal runs 1…53 with no gaps or repeats — which is what
 * keeps lexical id order chronological, like day and month ids.
 */
export function weekIdFromDate(date: Date): string {
  const start = startOfWeek(date)
  const jan1 = new Date(start.getFullYear(), 0, 1)
  // Rounded, not floored: a DST shift inside the span leaves the raw quotient
  // just under or over a whole number of days.
  const dayOfYear = Math.round((start.getTime() - jan1.getTime()) / 86_400_000) + 1
  const ordinal = Math.floor((dayOfYear - 1) / 7) + 1
  return `${start.getFullYear()}/00/${String(ordinal).padStart(2, '0')}`
}

export const calendarDefaults = {
  yearNameFormat: '{ yyyy }',
  monthNameFormat: '{"year":"numeric","month":"long"}',
  // `ww`, not the ISO `II`: the week ROWS start on the Mac's first weekday, so
  // the number has to be the one that scheme produces — and `bike.formatDate`
  // resolves `ww` against that same setting. `II` counts weeks from Monday
  // whatever the Mac says, which on a Sunday-start Mac labelled every week with
  // the PREVIOUS week's number (the row is formatted from its first day, and
  // ISO calls that Sunday the last day of the week before).
  // `yyyy`, not the week-numbering `Y`: a week row's date is its first day and
  // it nests under that day's month, so the calendar year always agrees with the
  // ancestor Year row. `Y` would disagree in the years where a week straddles
  // January 1.
  weekNameFormat: 'Week { ww }, { yyyy }',
  dayNameFormat: '{"dateStyle":"long"}',
  yearEnabled: true,
  monthEnabled: true,
  // Off by default: existing outlines keep the year/month/day shape they have.
  weekEnabled: false,
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
 * Substitute formatted dates into a field value, keeping surrounding text and
 * markdown. Each `{ … }` span is formatted independently — `{ yyyy }` (date-fns)
 * or `{"dateStyle":"long"}` (JSON Intl options) — so a field can hold more than
 * one, as the week default's `Week { ww }, { yyyy }` does. A field with no `{ … }`
 * span is treated as literal text (no date).
 *
 * Spans don't nest: a span runs to the first `}`, which is why Intl options must
 * be the flat objects `Intl.DateTimeFormat` already requires.
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
  return field.replace(/\{[^}]*\}/g, (span) => escape(formatSpec(date, span)))
}

/**
 * What a day/range selection shows: 'all' = day rows & dated rows
 * (default), 'dates' (⌘) = only dated rows, 'days' (⌥) = only day rows.
 */
export type CalendarSelectMode = 'all' | 'dates' | 'days'

export interface CalendarProtocol extends DOMProtocol {
  toDOM:
    | { type: 'selectDate'; date: string }
    | { type: 'clearSelection' }
    /**
     * Every calendar-visible date attribute, in registry order — sent in
     * reply to `ready` and re-pushed whenever the attribute registry
     * changes, so a panel that's already open picks up an attribute an
     * extension registers later.
     */
    | { type: 'dateAttributes'; attributes: DateAttribute[] }
  // Calendar navigation (click, arrows, drag) only FILTERS, per `mode` — it
  // never creates day rows. A single day is a degenerate range (start ===
  // end); `start`/`end` are inclusive days, normalized start ≤ end. `live`
  // marks a refinement of an in-progress gesture (a drag growing its
  // range): the filter applies without pushing a navigation history step.
  // `openDay` (Return / double-click on a single day) is the create
  // gesture: it find-or-creates the day row, clears any filter, focuses
  // into the day, and hands keyboard focus to the editor. `openRange`
  // (Return on a multi-day selection) find-or-creates a day row for EVERY
  // day in the inclusive range, clears any filter, block-selects those day
  // rows in the editor, and hands it keyboard focus.
  toApp:
    | { type: 'showRange'; start: string; end: string; mode?: CalendarSelectMode; live?: boolean }
    | { type: 'openDay'; date: string }
    | { type: 'openRange'; start: string; end: string }
    /**
     * The panel has mounted and installed its onmessage; reply with
     * `dateAttributes`. A DOM-initiated PULL, not an app-side push: app→DOM
     * postMessage is DROPPED when the DOM hasn't set onmessage yet, while
     * DOM→app messages are queued until the app installs its handler — and
     * the panel's React commit lands a tick after activate(), so a push
     * right after addItem() is a race. This is correct in both orders.
     */
    | { type: 'ready' }
}
