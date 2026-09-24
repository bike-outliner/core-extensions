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

// Coarse → fine. Day is always present; the others follow their settings.
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

// The calendar level of a persistentId, or null (see dateIdPattern).
function levelOfId(id: string): Level | null {
  if (!dateIdPattern.test(id)) return null
  const [, month, day] = id.split('/').map(Number)
  if (month > 0) return day > 0 ? 'day' : 'month'
  return day > 0 ? 'week' : 'year'
}

// A week resolves from its first day, so a week straddling a boundary always
// gets the same parent.
function canonicalDate(level: Level, date: Date): Date {
  return level === 'week' ? startOfWeek(date) : date
}

/**
 * Find-or-create the row for `date` at `level`. Existing rows are never moved.
 * The parent is the next coarser enabled level, created recursively; the
 * coarsest level joins existing peers wherever they live, else the root.
 * New rows go in chronological order among siblings.
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

function parentRow(outline: Outline, date: Date, level: Level): Row {
  const levels = enabledLevels()
  const idx = levels.indexOf(level)

  if (idx > 0) {
    return ensureRow(outline, canonicalDate(level, date), levels[idx - 1])
  }

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
  // Insert before the first later (or, newest-first, earlier) sibling rather
  // than appending, so fills come out ordered regardless of generation order.
  const newestFirst = bike.defaults.get('newestFirst') === true
  let insertBefore: Row | undefined
  for (const child of parent.children) {
    const pid = child.persistentId
    if (pid && pid.match(dateIdPattern) && (newestFirst ? id > pid : id < pid)) {
      insertBefore = child
      break
    }
  }
  // Inserted as markdown, so a leading marker sets the row type.
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

// The requested level if shown, else the nearest coarser shown level, else root.
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
