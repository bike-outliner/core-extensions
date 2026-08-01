import { Color, Image, Text } from 'bike/app'
import {
  clearAttributeOnSelection,
  filterCommand,
  pickAttributeForSelection,
  setAttributeOnSelection,
} from './helpers'

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
      // The picker: every value the type can hold, one dialog away.
      'due:set': pickAttributeForSelection('due'),
      // The three values worth reaching without a dialog — what
      // `priority:1/2/3` are to the priority menu. Dates are DATE-ONLY: a
      // timed `due` is a different thing (it's what scripts write), and the
      // badge renders it differently.
      // Thunks, not values: built once at registration, so a stamp computed
      // here would pin "today" to the day the app launched.
      'due:today': setAttributeOnSelection('due', () => dayStamp(0), 'Set Due'),
      'due:tomorrow': setAttributeOnSelection('due', () => dayStamp(1), 'Set Due'),
      // Valueless `@due` — "due, but no date yet", the state `emptyLabel` and
      // the `Soon` suggestion already name.
      'due:soon': setAttributeOnSelection('due', '', 'Set Due'),
      'due:clear': clearAttributeOnSelection('due', 'Clear Due'),
      // Every OPEN due item — rows with @due that aren't checked off.
      'due:filter': filterCommand({
        path: '//(@due and not @done)',
        label: 'Due',
        emptyTitle: 'No Due Items',
        emptyMessage: 'There are no due items that have not been completed.',
      }),
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

// The date-only wire form for the local day `offset` days from now, through
// the shared codec (a valid Date always encodes, hence the `!`). No
// `{ time: true }` — that flag belongs to `doneStamp`, which stamps an
// instant; a due DAY is a calendar day.
function dayStamp(offset: number): string {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return bike.encodeValue('date', day)!
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
