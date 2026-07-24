import { Color, CommandContext, Image, Text } from 'bike/app'
import { dateLabel } from '../../bike.bkext/app/attributes/dates'
import { dayDiffFromToday, dueUrgency, parseDue } from '../dom/due-marks'

// The "due" feature's PRESENTATION: commands (Set Due opens the attribute
// palette's value stage — Soon/Today/… suggestions and the calendar live
// there — Clear Due removes, Filter Due filters) that manage a `due`
// attribute on the selected rows, plus a value-aware badge showing the date
// relative when near ("Today", "Tomorrow", a weekday within the week).
// Clicking the badge opens the built-in default attribute menu
// (`menu: 'default'`): filter / Value… (the palette) / remove.
// The calendar inspector renders the same attribute as day marks and a
// day agenda (dom/Calendar.tsx) — that coupling is why due's presentation
// lives in the calendar extension.
//
// The due SHAPE (type, values/parsing, defaultBadge
// opt-out) is registered by bike.bkext's default attribute set — see
// bike.bkext/app/attributes/due.ts. A due value is `YYYY-MM-DD` (local calendar
// date), a full ISO-8601 UTC timestamp when a time is included, or EMPTY —
// a valueless `@due` means "soon": due, but no date yet (badge shows
// "Soon"). The palette sets date-only values; timed values come from
// scripts/automation and still render in the badge.
//
// TIME ZONES: a timed `due` is stored as UTC; parsing back to local
// wall-clock goes through `parseDue` (shared with the inspector in
// dom/due-marks.ts).

export function activateDue() {
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
      const due = parseDue(raw)

      const now = new Date((env.now ?? 0) * 1000)
      const dayDiff = due ? dayDiffFromToday(due.date, now) : 0
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
      const label = due ? dateLabel(due, now) : 'Soon'
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), color.alphaSet(done ? 0.3 : 0.8)))
        .withBackground({
          stroke: color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    // The built-in default attribute menu: filter / Value… (the standalone
    // due value picker) / remove.
    menu: 'default',
  })
}

// Open the standalone due value picker for the (first) selected row — the
// Soon/Today/… suggestions and the calendar live there. Nothing applies
// until the picker commits.
function setDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  editor.showPicker(rows[0], {
    attribute: 'due',
    onAccept: (value, { row }) => row.setAttribute('due', value),
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
