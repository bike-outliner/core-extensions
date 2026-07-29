import { Color, CommandContext, Image, Text } from 'bike/app'

// The `due` feature: when a row is due, plus the badge and commands that
// present and manage it.
//
// A due value is `YYYY-MM-DD` (local calendar date), a full ISO-8601 UTC
// timestamp when a time is included, or EMPTY — a valueless `@due` means
// "soon": due, but no date yet. The palette sets date-only values; timed
// values come from scripts/automation and still render in the badge.
//
// calendar.bkext ALSO renders due — it shows every `type: 'date'` attribute
// on its calendar and agenda — but the badge lives here so `@due` is visible
// whether or not that extension is enabled.

export function registerDue() {
  bike.attribute('due', {
    title: 'Due',
    type: 'date',
    emptyLabel: 'Soon',
    description: 'When the row is due — a calendar day, a timestamp, or valueless for "soon".',
    defaultBadge: false,
    suggestions: () => [{ name: 'Soon', value: '', menu: true }],
  })

  bike.commands.addCommands({
    commands: {
      'due:set': setDue,
      'due:clear': clearDue,
      'due:filter': filterDue,
    },
  })

  bike.badge('due', {
    where: '.@due',
    inputs: { due: '@due', done: '@done' },
    // Relative labels depend on the wall clock, not just the row's value —
    // tick supplies env.now so "Tomorrow" rolls over to "Today" at midnight.
    // Once a minute is plenty for a date label (it catches the rollover within
    // a minute), so it doesn't re-render every second like the clock badge.
    tick: 60,
    render: (values, env) => {
      const raw = values['due']
      if (raw == null) return null
      // The shared wire codec; undefined for the valueless "soon" (and any
      // junk a script stored).
      const due = bike.decodeValue('date', raw)?.date

      const now = new Date((env.now ?? 0) * 1000)
      const dayDiff = due ? dayDiffFromToday(due, now) : 0
      const done = values['done'] != null
      // Urgency tint for OPEN items: red when due today or overdue, orange
      // when due tomorrow or "soon" (a valueless @due — due, no date yet).
      // A @done row's due is history — it keeps the row's inherited color
      // no matter the date.
      const urgency = done ? 'later' : !due ? 'soon' : dueUrgency(dayDiff)
      const color =
        urgency === 'urgent' ? Color.systemRed() : urgency === 'soon' ? Color.systemOrange() : env.color
      // The full badge-metrics recipe (fontSize + padding size the tag,
      // stroke/radius draw its border), so this tag matches every other
      // drawn badge on the row. Completed rows fade the text down to the
      // border's alpha so the whole tag reads as done.
      const bm = env.badgeMetrics
      // The native display layer — the same labels the palette and
      // pickers show, computed at env.now so they roll over on tick.
      const label = raw === '' ? 'Soon' : env.formatAttribute('due', raw)
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), color.alphaSet(done ? 0.3 : 0.8)))
        .withBackground({
          stroke: color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    // The built-in attribute menu for @due: filter / Value… (the standalone
    // due value picker) / remove.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'due' }, 'due'),
  })
}

// Open the standalone due value picker for the (first) selected row — the
// Soon/Today/… suggestions and the calendar live there. Nothing applies
// until the picker commits.
function setDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  editor.showPicker({ row: rows[0] }, {
    source: { attribute: 'due' },
    onAccept: (value) => rows[0].setAttribute('due', value),
  })
  return true
}

// Filter the editor to every open due item — rows with @due that aren't
// checked off. When nothing would match, alert instead of showing an empty
// filtered view. Focus goes home first so the filter covers the whole
// outline; one transaction so the layer sees a single old→new event.
function filterDue({ editor }: CommandContext): boolean {
  if (!editor) return false
  const duePath = '//(@due and not @done)'
  if ((editor.outline.query(`count(${duePath})`).value as number) === 0) {
    bike.showAlert(
      {
        title: 'No Due Items',
        message: 'There are no due items that have not been completed.',
        style: 'informational',
        buttons: ['OK'],
      },
      bike.frontmostWindow
    )
    return true
  }
  editor.transaction({ label: 'Show Due', animate: { spring: 'navigation' } }, () => {
    editor.focus = editor.outline.root
    editor.filter = { path: duePath, label: 'Due' }
  })
  return true
}

// Remove `due` from every selected row.
function clearDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  editor.outline.transaction({ label: 'Clear Due' }, () => {
    for (const row of rows) row.removeAttribute('due')
  })
  return true
}

// Just enough date MATH for the urgency tint — wire parsing itself is
// bike.decodeValue (the shared codec, above). calendar.bkext has richer
// calendar helpers (dom/date-marks.ts, which also buckets by day and labels
// the agenda), but extensions bundle separately so neither can import the
// other's.
//
// Whole local days from `now`'s day to `date`'s day: 0 today, 1 tomorrow,
// negative in the past.
function dayDiffFromToday(date: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86400000)
}

function dueUrgency(dayDiff: number): 'urgent' | 'soon' | 'later' {
  return dayDiff <= 0 ? 'urgent' : dayDiff === 1 ? 'soon' : 'later'
}
