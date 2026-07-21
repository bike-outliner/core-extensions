import { Color, CommandContext, Image, MenuItem, OutlineEditor, Row, Text } from 'bike/app'
import { dateLabel } from '../../bike.bkext/app/dates'
import { dayDiffFromToday, dayKey, dueUrgency, parseDue } from '../dom/due-marks'

// The "due" feature's PRESENTATION: two commands (Set Due opens the due
// menu, Clear Due removes) that manage a `due` attribute on the selected
// rows, plus a value-aware badge showing the date relative when near
// ("Today", "Tomorrow", a weekday within the week). Clicking the badge
// opens a menu with Soon/Today/Tomorrow quick-set shortcuts (checkbox
// style — clicking the checked one clears the due) above an inline calendar
// picker; picking a day commits it and closes the menu — Esc discards.
// Clear Due sits at the bottom, but only when the row has a due to clear.
// The menu is built imperatively from the row (`showDueMenu`), which is how
// `due:schedule` offers it on fresh rows the badge doesn't decorate — seeded
// to today, Return commits the first value.
// The calendar inspector renders the same attribute as day marks and a
// day agenda (dom/Calendar.tsx) — that coupling is why due's presentation
// lives in the calendar extension.
//
// The due SHAPE (type, sigil, completion values/parsing, defaultBadge
// opt-out) is registered by bike.bkext's default attribute set — see
// bike.bkext/app/attributes.ts. A due value is `YYYY-MM-DD` (local calendar
// date), a full ISO-8601 UTC timestamp when a time is included, or EMPTY —
// a valueless `@due` means "soon": due, but no date yet (the menu's Soon
// shortcut; badge shows "Soon"). The menu sets date-only values; timed
// values come from scripts/automation and still render in the badge.
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
    onClick: ({ editor, row }) => showDueMenu(editor, row),
  })
}

// Present the due menu for a row — from the badge's onClick, and from
// `due:schedule` on rows with no due yet (where there's no badge to click).
function showDueMenu(editor: OutlineEditor, row: Row) {
  const raw = row.getAttribute('due')
  const due = parseDue(raw ?? '')
  // Valueless (or unparseable) @due means "soon" — due, but no date yet.
  const isSoon = raw != null && !due
  const now = new Date()
  const isToday = !!due && dayDiffFromToday(due.date, now) === 0
  const isTomorrow = !!due && dayDiffFromToday(due.date, now) === 1

  const items: MenuItem[] = []
  items.push({ type: 'button', id: 'command:due:filter', title: 'Filter Due', symbol: 'line.3.horizontal.decrease' })
  items.push({ type: 'separator' })
  // Quick-set shortcuts, checkbox style: clicking the checked one removes
  // the due entirely.
  items.push({ type: 'button', id: 'soon', title: 'Soon', symbol: 'calendar', state: isSoon ? 'on' : 'off' })
  items.push({ type: 'button', id: 'today', title: 'Today', symbol: 'calendar', state: isToday ? 'on' : 'off' })
  items.push({ type: 'button', id: 'tomorrow', title: 'Tomorrow', symbol: 'calendar', state: isTomorrow ? 'on' : 'off' })
  items.push({ type: 'separator' })
  items.push(
    // Date-only: a timed due seeds its LOCAL day (due.date is local from
    // parseDue). No value (row without a due) opens on today with nothing
    // selected.
    { type: 'calendar', id: 'due', value: due ? serializeDateOnly(due.date) : undefined }
  )
  // Gate on attribute presence (not a parsed date) so a Soon row can Clear.
  if (raw != null) {
    items.push({ type: 'separator' })
    items.push({ type: 'button', id: 'command:due:clear', title: 'Clear Due', symbol: 'trash' })
  }

  editor.showMenu(row, {
    items: () => items,
    anchor: 'due',
    onAction: (id, value, { editor, row }) => {
      // The calendar commits `YYYY-MM-DD` (local); parse just to validate,
      // then store date-only. Recommitting a timed due drops its time — the
      // menu has no way to edit one.
      if (id === 'due' && typeof value === 'string') {
        const picked = parseDue(value)
        if (!picked) return
        editor.outline.transaction({ label: 'Set Due' }, () => {
          row.setAttribute('due', serializeDateOnly(picked.date))
        })
        return
      }

      const shortcut =
        id === 'soon' ? { checked: isSoon, value: '' }
        : id === 'today' ? { checked: isToday, value: serializeDateOnly(now) }
        : id === 'tomorrow'
          ? {
              checked: isTomorrow,
              value: serializeDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
            }
          : null
      if (!shortcut) return
      if (shortcut.checked) {
        editor.outline.transaction({ label: 'Clear Due' }, () => {
          row.removeAttribute('due')
        })
      } else {
        editor.outline.transaction({ label: 'Set Due' }, () => {
          row.setAttribute('due', shortcut.value)
        })
      }
    },
  })
}

// Open the due menu for the (first) selected row. The menu is where the
// value gets set — nothing applies until the menu commits (Return).
function setDue({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  showDueMenu(editor, rows[0])
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

// `parseDue` / `dayKey` (the `YYYY-MM-DD` serialization) are shared with the
// calendar inspector via dom/due-marks.ts.
const serializeDateOnly = dayKey
