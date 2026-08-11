import { Outline, Row } from 'bike/app'
import { dateIdPattern, startOfWeek, substituteDate } from '../dom/protocols'
import { getDaysInMonth, getDaysInWeek, getMonthsInYear, getDateComponents } from './util'

type Level = 'year' | 'month' | 'week' | 'day'

const FIELD_KEY: Record<Level, string> = {
  year: 'yearNameFormat',
  month: 'monthNameFormat',
  week: 'weekNameFormat',
  day: 'dayNameFormat',
}

// Levels to generate, coarse → fine. Day is always present; Year/Month/Week
// follow their include setting. Year and Month default on, Week off, so an
// outline that has never touched the setting keeps the structure it has.
function enabledLevels(): Level[] {
  const levels: Level[] = []
  if (bike.defaults.get('yearEnabled') !== false) levels.push('year')
  if (bike.defaults.get('monthEnabled') !== false) levels.push('month')
  if (bike.defaults.get('weekEnabled') === true) levels.push('week')
  levels.push('day')
  return levels
}

function idForLevel(level: Level, date: Date): string {
  const c = getDateComponents(date)
  return level === 'year'
    ? c.yearId
    : level === 'month'
      ? c.monthId
      : level === 'week'
        ? c.weekId
        : c.dayId
}

// The calendar level a persistentId belongs to, or null. `00` marks a slot the
// level doesn't use, and a week keeps its ordinal in the day slot with the
// month zeroed (see dateIdPattern).
function levelOfId(id: string): Level | null {
  if (!dateIdPattern.test(id)) return null
  const [, month, day] = id.split('/').map(Number)
  if (month > 0) return day > 0 ? 'day' : 'month'
  return day > 0 ? 'week' : 'year'
}

// The date a level's row stands for. A week row belongs to its first day, so
// its own ancestors must be resolved from that day rather than from whichever
// day of the week happened to trigger creation — otherwise a week straddling a
// month or year boundary lands under a different parent depending on the order
// its days were opened.
function canonicalDate(level: Level, date: Date): Date {
  return level === 'week' ? startOfWeek(date) : date
}

/**
 * Find-or-create the row for `date` at `level`, returning it.
 *
 * Placement:
 *  1. If the exact row id already exists, reuse it (never moved or duplicated).
 *  2. Its parent is the next coarser enabled level, created recursively — a day
 *     lands under its own week or month, a month under its year. A week goes
 *     under the month/year of its FIRST day, so one that straddles a boundary
 *     stays whole rather than splitting across two parents.
 *  3. The coarsest level has no calendar parent: it joins existing peer rows
 *     wherever they live (so the calendar can be moved anywhere), or the
 *     document root when there are none.
 * New rows are inserted in chronological order among their same-level siblings.
 */
function ensureRow(outline: Outline, date: Date, level: Level): Row {
  const id = idForLevel(level, date)
  const existing = outline.getRowById(id)
  if (existing) return existing

  return outline.transaction({ animate: 'default' }, () => {
    const again = outline.getRowById(id)
    if (again) return again
    const parent = parentRow(outline, date, level)
    const text = substituteDate(canonicalDate(level, date), bike.defaults.get(FIELD_KEY[level]), {
      escapeMarkdown: true,
    })
    return insertDateRow(outline, id, text, parent)
  })
}

// The parent under which a new `level` row should go.
function parentRow(outline: Outline, date: Date, level: Level): Row {
  const levels = enabledLevels()
  const idx = levels.indexOf(level)

  // Coarser enabled level present → that level's row is the parent, resolved
  // from this level's own date (a week's month is its first day's month).
  if (idx > 0) {
    return ensureRow(outline, canonicalDate(level, date), levels[idx - 1])
  }

  // Coarsest level: join existing peers' container, else the document root.
  const targetId = idForLevel(level, date)
  const peers = outline.root.descendants.filter((r) => {
    const pid = r.persistentId
    return pid != null && levelOfId(pid) === level
  })
  if (peers.length === 0) return outline.root

  // Prefer the nearest previous peer; otherwise the earliest one.
  let chosen = peers[0]
  for (const peer of peers) {
    const pid = peer.persistentId!
    if (pid <= targetId && (chosen.persistentId! > targetId || pid > chosen.persistentId!)) {
      chosen = peer
    } else if (chosen.persistentId! > targetId && pid < chosen.persistentId!) {
      chosen = peer
    }
  }
  return chosen.parent ?? outline.root
}

function insertDateRow(outline: Outline, id: string, text: string, parent: Row): Row {
  let insertBefore: Row | undefined
  for (const child of parent.children) {
    const pid = child.persistentId
    if (pid && pid.match(dateIdPattern) && id < pid) {
      insertBefore = child
      break
    }
  }
  // Inserted as markdown: Bike's model parses the expanded string, so a leading
  // marker (#, >, 1., -, etc.) sets the row type and inline markdown is applied.
  return outline.insertRows(
    [{ persistentId: id, text, format: 'markdown' }],
    parent,
    insertBefore
  )[0]
}

export function getDayRow(outline: Outline, date: Date): Row {
  return ensureRow(outline, date, 'day')
}

export function getWeekRow(outline: Outline, date: Date): Row {
  return outline.transaction({ animate: 'default' }, () => {
    for (const day of getDaysInWeek(date)) {
      ensureRow(outline, day, 'day')
    }
    return focusRow(outline, date, 'week')
  })
}

export function getMonthRow(outline: Outline, date: Date): Row {
  return outline.transaction({ animate: 'default' }, () => {
    for (const day of getDaysInMonth(date)) {
      ensureRow(outline, day, 'day')
    }
    return focusRow(outline, date, 'month')
  })
}

export function getYearRow(outline: Outline, date: Date): Row {
  return outline.transaction({ animate: 'default' }, () => {
    for (const month of getMonthsInYear(date.getFullYear())) {
      for (const day of getDaysInMonth(month)) {
        ensureRow(outline, day, 'day')
      }
    }
    return focusRow(outline, date, 'year')
  })
}

// Each level, then the levels above it, coarsest last.
const COARSER_CHAIN: Record<Level, Level[]> = {
  day: ['day', 'week', 'month', 'year'],
  week: ['week', 'month', 'year'],
  month: ['month', 'year'],
  year: ['year'],
}

// The row a command should focus/select: the requested level if shown, else the
// nearest coarser shown level, else the document root.
function focusRow(outline: Outline, date: Date, level: Level): Row {
  const enabled = enabledLevels()
  const coarserChain = COARSER_CHAIN[level]
  for (const l of coarserChain) {
    if (enabled.includes(l)) {
      const row = outline.getRowById(idForLevel(l, date))
      if (row) return row
    }
  }
  return outline.root
}
