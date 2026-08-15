import {
  DateHit,
  DateRow,
  NEVER_MATCH,
  agendaTimeLabel,
  bucketByDay,
  calendarQueryPath,
  dateAttributesFrom,
  dateQueryPath,
  dateRangeClause,
  dayKey,
  dayMarkTooltip,
  dayMarkVariant,
  dueUrgency,
  isClosed,
  isSafeAttributeName,
  parseDateValue,
  rowDisplayText,
  sortAgendaHits,
  visibleRange,
} from '../dom/date-marks'

// All date expectations are built from LOCAL components (or round-tripped
// through a local Date), so these tests pass in any time zone — the exact
// property the helpers must preserve.

describe('parseDateValue', () => {
  it('parses a date-only value from local components', () => {
    const value = parseDateValue('2026-07-16')
    assert(value, 'should parse')
    assert.equal(value!.hasTime, false)
    assert.equal(value!.date.getFullYear(), 2026)
    assert.equal(value!.date.getMonth(), 6)
    assert.equal(value!.date.getDate(), 16)
    assert.equal(value!.date.getHours(), 0, 'date-only means local midnight')
  })

  it('buckets a timed UTC value to the LOCAL day it falls in', () => {
    // 23:30 local can be the next day in UTC; the parsed date must still
    // read back as the same local day.
    const local = new Date(2026, 6, 16, 23, 30)
    const value = parseDateValue(local.toISOString())
    assert(value, 'should parse')
    assert.equal(value!.hasTime, true)
    assert.equal(dayKey(value!.date), '2026-07-16')
  })

  it('rejects unparseable values', () => {
    assert.equal(parseDateValue(''), null)
    assert.equal(parseDateValue('soon'), null)
    assert.equal(parseDateValue('2026-7-1'), null, 'unpadded is not a date value')
    assert.equal(parseDateValue('2026-07-16Tnot-a-time'), null)
  })
})

describe('agendaTimeLabel', () => {
  it('formats a timed value as local wall-clock time', () => {
    const local = new Date(2026, 6, 16, 23, 30)
    const label = agendaTimeLabel(parseDateValue(local.toISOString())!, 'en-US')
    assert(label, 'timed value should have a label')
    // ICU inserts a narrow no-break space before AM/PM in some versions —
    // assert the parts, not the exact string.
    assert(label!.includes('11:30'), `label shows the minutes: ${label}`)
    assert(/PM/.test(label!), `label shows the day period: ${label}`)
  })

  it('returns null for a date-only value', () => {
    assert.equal(agendaTimeLabel(parseDateValue('2026-07-16')!, 'en-US'), null)
  })

  it('returns null for a timed value at exactly local midnight', () => {
    const midnight = new Date(2026, 6, 16, 0, 0)
    assert.equal(agendaTimeLabel(parseDateValue(midnight.toISOString())!, 'en-US'), null)
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

describe('isSafeAttributeName', () => {
  // The registry only rejects RESERVED names, so a definition can carry a
  // name the path grammar won't accept. Those are dropped, not escaped.
  it('accepts path-grammar names', () => {
    for (const name of ['due', 'start', 'my-attr', 'a.b', 'a:b', '_x', 'x9']) {
      assert.equal(isSafeAttributeName(name), true, name)
    }
  })

  it('rejects names that would corrupt a generated query', () => {
    for (const name of ['', '1x', 'a b', 'a"b', 'a)b', '@x', '-x']) {
      assert.equal(isSafeAttributeName(name), false, name)
    }
  })
})

describe('dateAttributesFrom', () => {
  it('keeps date types in registry order, mapping title', () => {
    const attributes = dateAttributesFrom([
      { name: 'start', title: 'Start', type: 'date' },
      { name: 'estimate', title: 'Estimate', type: 'duration' },
      { name: 'due', title: 'Due', type: 'date' },
      { name: 'priority', title: 'Priority', type: 'choice' },
    ])
    assert.equal(
      JSON.stringify(attributes),
      JSON.stringify([
        { name: 'start', title: 'Start' },
        { name: 'due', title: 'Due' },
      ])
    )
  })

  it('drops metadata.calendar === false (that is done)', () => {
    const attributes = dateAttributesFrom([
      { name: 'due', title: 'Due', type: 'date', metadata: {} },
      { name: 'date', title: 'Date', type: 'date', metadata: { calendar: false } },
      // Any other metadata is opaque — it must not exclude anything.
      { name: 'start', title: 'Start', type: 'date', metadata: { calendar: true, other: 'x' } },
    ])
    assert.equal(attributes.map((a) => a.name).join(','), 'due,start')
  })

  it('drops names the path grammar would reject', () => {
    const attributes = dateAttributesFrom([
      { name: 'my attr', title: 'My Attr', type: 'date' },
      { name: 'due', title: 'Due', type: 'date' },
    ])
    assert.equal(attributes.map((a) => a.name).join(','), 'due')
  })
})

describe('dateRangeClause', () => {
  const start = new Date(2026, 6, 16)
  const end = new Date(2026, 6, 17)

  it('builds a half-open [d] range over local-date literals', () => {
    assert.equal(
      dateRangeClause(['due'], start, end),
      '(@due >=[d] "2026-07-16" and @due <[d] "2026-07-17")'
    )
  })

  it('or-chains every attribute, in the given order', () => {
    assert.equal(
      dateRangeClause(['start', 'due', 'review'], start, end),
      '(@start >=[d] "2026-07-16" and @start <[d] "2026-07-17")' +
        ' or (@due >=[d] "2026-07-16" and @due <[d] "2026-07-17")' +
        ' or (@review >=[d] "2026-07-16" and @review <[d] "2026-07-17")'
    )
  })

  it('is null with no attributes, so callers omit the clause', () => {
    assert.equal(dateRangeClause([], start, end), null)
  })
})

describe('dateQueryPath', () => {
  // The single-attribute output is byte-for-byte what the due-only calendar
  // emitted before date attributes were generalized.
  it('builds a half-open [d] range over local-date literals, plus a today clause', () => {
    const path = dateQueryPath(['due'], visibleRange(new Date(2026, 6, 15)), new Date(2026, 6, 16))
    assert.equal(
      path,
      '//(@due >=[d] "2026-06-24" and @due <[d] "2026-08-08")' +
        ' or (@due >=[d] "2026-07-16" and @due <[d] "2026-07-17")'
    )
  })

  it("today's clause spans month and year boundaries", () => {
    const path = dateQueryPath(['due'], visibleRange(new Date(2026, 0, 15)), new Date(2026, 11, 31))
    assert.equal(
      path,
      '//(@due >=[d] "2025-12-25" and @due <[d] "2026-02-08")' +
        ' or (@due >=[d] "2026-12-31" and @due <[d] "2027-01-01")'
    )
  })

  it('covers every attribute in both the range and today clauses', () => {
    const path = dateQueryPath(['start', 'due'], visibleRange(new Date(2026, 6, 15)), new Date(2026, 6, 16))
    assert.equal(
      path,
      '//(@start >=[d] "2026-06-24" and @start <[d] "2026-08-08")' +
        ' or (@due >=[d] "2026-06-24" and @due <[d] "2026-08-08")' +
        ' or (@start >=[d] "2026-07-16" and @start <[d] "2026-07-17")' +
        ' or (@due >=[d] "2026-07-16" and @due <[d] "2026-07-17")'
    )
  })

  it('matches nothing when no date attributes are registered', () => {
    assert.equal(dateQueryPath([], visibleRange(new Date(2026, 6, 15)), new Date(2026, 6, 16)), NEVER_MATCH)
  })
})

describe('calendarQueryPath', () => {
  // A one-week range keeps the expected id list short.
  const range = { start: new Date(2026, 6, 16), end: new Date(2026, 6, 19) }
  const dayIds = '@id = "2026/07/16" or @id = "2026/07/17" or @id = "2026/07/18"'

  it('appends an id match per visible day to the date clauses', () => {
    const path = calendarQueryPath(['due'], range, new Date(2026, 6, 16))
    assert.equal(
      path,
      '//(@due >=[d] "2026-07-16" and @due <[d] "2026-07-19")' +
        ' or (@due >=[d] "2026-07-16" and @due <[d] "2026-07-17")' +
        ` or ${dayIds}`
    )
  })

  it('falls back to day ids ALONE when no date attributes are registered', () => {
    // Bold day numbers must keep working, and the dead `@id = ""` term of
    // NEVER_MATCH must not be spliced in ahead of the real ids.
    const path = calendarQueryPath([], range, new Date(2026, 6, 16))
    assert.equal(path, `//${dayIds}`)
    assert.equal(path.includes('@id = ""'), false)
    assert.equal(path.includes('//()'), false)
  })
})

describe('bucketByDay', () => {
  const row = (attributes: Record<string, string> | undefined, text = 'row'): DateRow => ({
    attributes,
    text: [{ string: text }],
  })

  it('groups rows by local day, skipping unparseable values', () => {
    const timed = new Date(2026, 6, 16, 23, 30).toISOString()
    const rows = [
      row({ due: '2026-07-16' }, 'a'),
      row({ due: timed }, 'b'),
      row({ due: '2026-07-17' }, 'c'),
      row(undefined, 'no attributes'),
      row({ due: 'someday' }, 'garbage due'),
    ]
    const buckets = bucketByDay(rows, ['due'])
    assert.equal(buckets.size, 2)
    assert.equal(buckets.get('2026-07-16')!.length, 2)
    assert.equal(buckets.get('2026-07-17')!.length, 1)
  })

  it('places a row on EVERY day its date attributes name', () => {
    const rows = [row({ start: '2026-07-16', due: '2026-07-20' }, 'task')]
    const buckets = bucketByDay(rows, ['start', 'due'])
    assert.equal(buckets.get('2026-07-16')!.length, 1)
    assert.equal(buckets.get('2026-07-16')![0].attribute, 'start')
    assert.equal(buckets.get('2026-07-20')![0].attribute, 'due')
  })

  it('yields one hit per attribute even when they coincide', () => {
    const buckets = bucketByDay([row({ start: '2026-07-16', due: '2026-07-16' })], ['start', 'due'])
    assert.equal(
      buckets.get('2026-07-16')!.map((hit) => hit.attribute).join(','),
      'start,due',
      'attributes iterate in registry order'
    )
  })

  it('ignores attributes outside the names list', () => {
    // The log-exclusion guard: `date` is a date attribute, but it is not in
    // `names`, so a row is not placed on the day of its history.
    const buckets = bucketByDay([row({ date: '2026-07-16', due: '2026-07-20' })], ['due'])
    assert.equal(buckets.has('2026-07-16'), false)
    assert.equal(buckets.get('2026-07-20')!.length, 1)
  })

  it('preserves document order within a day', () => {
    const buckets = bucketByDay(
      [row({ due: '2026-07-16' }, 'first'), row({ due: '2026-07-16' }, 'second')],
      ['due']
    )
    const texts = buckets.get('2026-07-16')!.map((hit) => rowDisplayText(hit.row))
    assert.equal(texts.join(','), 'first,second')
  })

  it('returns an empty map for undefined rows (null snapshot)', () => {
    assert.equal(bucketByDay(undefined, ['due']).size, 0)
  })
})

describe('sortAgendaHits', () => {
  const hitAt = (value: string, text: string): DateHit => ({
    row: { attributes: { due: value }, text: [{ string: text }] },
    attribute: 'due',
    value: parseDateValue(value)!,
  })

  it('puts date-only items first, then timed items by time', () => {
    const hits = [
      hitAt(new Date(2026, 6, 16, 14, 0).toISOString(), 'afternoon'),
      hitAt('2026-07-16', 'all-day'),
      hitAt(new Date(2026, 6, 16, 9, 0).toISOString(), 'morning'),
    ]
    const texts = sortAgendaHits(hits).map((hit) => rowDisplayText(hit.row))
    assert.equal(texts.join(','), 'all-day,morning,afternoon')
  })

  it('keeps bucket order within ties and leaves input unmutated', () => {
    const hits = [hitAt('2026-07-16', 'first'), hitAt('2026-07-16', 'second')]
    const sorted = sortAgendaHits(hits)
    assert.equal(sorted.map((hit) => rowDisplayText(hit.row)).join(','), 'first,second')
    assert.notEqual(sorted, hits, 'returns a copy')
  })
})

describe('dayMarkVariant', () => {
  const hit = (attribute: string, closed = false): DateHit => ({
    row: { attributes: closed ? { status: 'done' } : {}, text: [] },
    attribute,
    value: parseDateValue('2026-07-16')!,
  })

  it('takes urgency from OPEN due items', () => {
    assert.equal(dayMarkVariant([hit('due')], 0), 'urgent')
    assert.equal(dayMarkVariant([hit('due')], -5), 'urgent')
    assert.equal(dayMarkVariant([hit('due')], 1), 'soon')
    assert.equal(dayMarkVariant([hit('due')], 5), 'later')
  })

  it('is never urgent for a non-deadline attribute', () => {
    // A `start` that has passed is not a fire — this is the whole reason
    // urgency is named rather than inferred from `type: 'date'`.
    assert.equal(dayMarkVariant([hit('start')], 0), 'later')
    assert.equal(dayMarkVariant([hit('start')], -5), 'later')
  })

  it('ignores done rows when deciding urgency', () => {
    assert.equal(dayMarkVariant([hit('due', true), hit('start')], 0), 'later')
    assert.equal(dayMarkVariant([hit('due', true), hit('due')], 0), 'urgent')
  })

  it('is done when every row is checked off', () => {
    assert.equal(dayMarkVariant([hit('due', true), hit('start', true)], -5), 'done')
  })
})

describe('dayMarkTooltip', () => {
  const hit = (attribute: string): DateHit => ({
    row: { attributes: {}, text: [] },
    attribute,
    value: parseDateValue('2026-07-16')!,
  })

  it('counts per attribute, titled, in first-hit order', () => {
    const titles = new Map([
      ['due', 'Due'],
      ['start', 'Start'],
    ])
    assert.equal(dayMarkTooltip([hit('due'), hit('due'), hit('start')], titles), '2 Due, 1 Start')
  })

  it('falls back to the raw name when no title is known', () => {
    assert.equal(dayMarkTooltip([hit('review')], new Map()), '1 review')
  })
})

describe('isClosed', () => {
  it('is true for both closed states', () => {
    assert.equal(isClosed({ attributes: { status: 'done' }, text: [] }), true)
    assert.equal(isClosed({ attributes: { status: 'canceled' }, text: [] }), true)
  })

  it('is false for open states and for no status at all', () => {
    assert.equal(isClosed({ attributes: { status: 'started' }, text: [] }), false)
    assert.equal(isClosed({ attributes: { due: '2026-07-16' }, text: [] }), false)
    assert.equal(isClosed({ text: [] }), false)
  })
})

describe('dueUrgency', () => {
  it('is urgent for today AND any day before', () => {
    assert.equal(dueUrgency(-30), 'urgent')
    assert.equal(dueUrgency(-1), 'urgent')
    assert.equal(dueUrgency(0), 'urgent')
  })

  it('is soon for tomorrow, later beyond', () => {
    assert.equal(dueUrgency(1), 'soon')
    assert.equal(dueUrgency(2), 'later')
    assert.equal(dueUrgency(30), 'later')
  })
})

describe('rowDisplayText', () => {
  it('concatenates all runs, not just the first', () => {
    const text = rowDisplayText({ text: [{ string: 'due ' }, { string: 'soon' }] })
    assert.equal(text, 'due soon')
  })
})
