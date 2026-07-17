import {
  DueRow,
  agendaTimeLabel,
  bucketByDay,
  dayKey,
  dueQueryPath,
  parseDue,
  rowDisplayText,
  sortAgendaRows,
  visibleRange,
} from '../dom/due-marks'

// All date expectations are built from LOCAL components (or round-tripped
// through a local Date), so these tests pass in any time zone — the exact
// property the helpers must preserve.

describe('parseDue', () => {
  it('parses a date-only value from local components', () => {
    const due = parseDue('2026-07-16')
    assert(due, 'should parse')
    assert.equal(due!.hasTime, false)
    assert.equal(due!.date.getFullYear(), 2026)
    assert.equal(due!.date.getMonth(), 6)
    assert.equal(due!.date.getDate(), 16)
    assert.equal(due!.date.getHours(), 0, 'date-only means local midnight')
  })

  it('buckets a timed UTC value to the LOCAL day it falls in', () => {
    // 23:30 local can be the next day in UTC; the parsed date must still
    // read back as the same local day.
    const local = new Date(2026, 6, 16, 23, 30)
    const due = parseDue(local.toISOString())
    assert(due, 'should parse')
    assert.equal(due!.hasTime, true)
    assert.equal(dayKey(due!.date), '2026-07-16')
  })

  it('rejects unparseable values', () => {
    assert.equal(parseDue(''), null)
    assert.equal(parseDue('soon'), null)
    assert.equal(parseDue('2026-7-1'), null, 'unpadded is not a due value')
    assert.equal(parseDue('2026-07-16Tnot-a-time'), null)
  })
})

describe('agendaTimeLabel', () => {
  const rowDue = (due: string): DueRow => ({ attributes: { due }, text: [{ string: 'x' }] })

  it('formats a timed due as local wall-clock time', () => {
    const local = new Date(2026, 6, 16, 23, 30)
    const label = agendaTimeLabel(rowDue(local.toISOString()), 'en-US')
    assert(label, 'timed due should have a label')
    // ICU inserts a narrow no-break space before AM/PM in some versions —
    // assert the parts, not the exact string.
    assert(label!.includes('11:30'), `label shows the minutes: ${label}`)
    assert(/PM/.test(label!), `label shows the day period: ${label}`)
  })

  it('returns null for a date-only due', () => {
    assert.equal(agendaTimeLabel(rowDue('2026-07-16'), 'en-US'), null)
  })

  it('returns null for a timed due at exactly local midnight', () => {
    const midnight = new Date(2026, 6, 16, 0, 0)
    assert.equal(agendaTimeLabel(rowDue(midnight.toISOString()), 'en-US'), null)
  })

  it('returns null for a row with no due', () => {
    assert.equal(agendaTimeLabel({ text: [{ string: 'x' }] }, 'en-US'), null)
  })
})

describe('dayKey', () => {
  it('pads month and day', () => {
    assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05')
    assert.equal(dayKey(new Date(2026, 11, 31)), '2026-12-31')
  })
})

describe('visibleRange', () => {
  it('pads the month by a week on each side', () => {
    const range = visibleRange(new Date(2026, 6, 15))
    assert.equal(dayKey(range.start), '2026-06-24')
    assert.equal(dayKey(range.end), '2026-08-08')
  })

  it('spans year boundaries', () => {
    const january = visibleRange(new Date(2026, 0, 1))
    assert.equal(dayKey(january.start), '2025-12-25')
    const december = visibleRange(new Date(2026, 11, 10))
    assert.equal(dayKey(december.end), '2027-01-08')
  })
})

describe('dueQueryPath', () => {
  it('builds a half-open [d] range over local-date literals', () => {
    const path = dueQueryPath(visibleRange(new Date(2026, 6, 15)))
    assert.equal(path, '//@due >=[d] "2026-06-24" and @due <[d] "2026-08-08"')
  })
})

describe('bucketByDay', () => {
  const row = (due: string | undefined, text = 'row'): DueRow => ({
    attributes: due === undefined ? undefined : { due },
    text: [{ string: text }],
  })

  it('groups rows by local due day, skipping unparseable ones', () => {
    const timed = new Date(2026, 6, 16, 23, 30).toISOString()
    const rows = [
      row('2026-07-16', 'a'),
      row(timed, 'b'),
      row('2026-07-17', 'c'),
      row(undefined, 'no attributes'),
      row('someday', 'garbage due'),
    ]
    const buckets = bucketByDay(rows)
    assert.equal(buckets.size, 2)
    assert.equal(buckets.get('2026-07-16')!.length, 2)
    assert.equal(buckets.get('2026-07-17')!.length, 1)
  })

  it('preserves document order within a day', () => {
    const buckets = bucketByDay([row('2026-07-16', 'first'), row('2026-07-16', 'second')])
    const texts = buckets.get('2026-07-16')!.map(rowDisplayText)
    assert.equal(texts.join(','), 'first,second')
  })

  it('returns an empty map for undefined rows (null snapshot)', () => {
    assert.equal(bucketByDay(undefined).size, 0)
  })
})

describe('sortAgendaRows', () => {
  const rowAt = (due: string, text: string): DueRow => ({ attributes: { due }, text: [{ string: text }] })

  it('puts date-only items first, then timed items by time', () => {
    const rows = [
      rowAt(new Date(2026, 6, 16, 14, 0).toISOString(), 'afternoon'),
      rowAt('2026-07-16', 'all-day'),
      rowAt(new Date(2026, 6, 16, 9, 0).toISOString(), 'morning'),
    ]
    const texts = sortAgendaRows(rows).map(rowDisplayText)
    assert.equal(texts.join(','), 'all-day,morning,afternoon')
  })

  it('keeps document order within ties and leaves input unmutated', () => {
    const rows = [rowAt('2026-07-16', 'first'), rowAt('2026-07-16', 'second')]
    const sorted = sortAgendaRows(rows)
    assert.equal(sorted.map(rowDisplayText).join(','), 'first,second')
    assert.notEqual(sorted, rows, 'returns a copy')
  })
})

describe('rowDisplayText', () => {
  it('concatenates all runs, not just the first', () => {
    const text = rowDisplayText({ text: [{ string: 'due ' }, { string: 'soon' }] })
    assert.equal(text, 'due soon')
  })
})
