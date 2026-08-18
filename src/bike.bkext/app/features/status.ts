import { BadgeEnvironment, Image, Text } from 'bike/app'

// The `status` feature: a row's state.
//
// Row-generic, not task-specific — any row can carry a status, and absent
// means todo. The task row type only adds a UI shortcut (the checkbox and
// Space); the concept stands on its own, as do the log and the clock.
//
// One field holds the state — todo | started | done | canceled — so no
// combination of stored values can describe two states at once. The
// open/closed split is what queries actually ask about, and it is a native
// path function (`open()` / `closed()`) rather than something spelled out per
// call site: written as "not done and not canceled", every one of those
// predicates would quietly acquire a hole the day a fifth state is added.
//
// The commands live in the host (`status:toggle-done`, `status:done`, …)
// because the checkbox, the Space key, and the sort-completed-to-end behavior
// are all native. Recording a state change is native too, but it is not a
// reason to route through a command: the host logs a transition — and stops a
// running clock — at the end of whatever transaction wrote the attribute, so
// every writer keeps history, this menu included.

// The whole vocabulary, shared by `status` (a row's own state) and
// `log-status` (a state an entry records), so the two can never drift.
const STATUS_CHOICES = [
  { name: 'Todo', value: 'todo' },
  { name: 'Started', value: 'started' },
  { name: 'Done', value: 'done' },
  { name: 'Canceled', value: 'canceled' },
]

export function registerStatus() {
  bike.attribute('status', {
    title: 'Status',
    // Closed: these four are the whole vocabulary, and `open()`/`closed()`
    // are defined over exactly them.
    type: 'choice',
    choices: STATUS_CHOICES,
    description: 'A row\u2019s state. Absent means todo.',
    // The badge below presents this attribute — opt out of the catch-all.
    defaultBadge: false,
    // Off the calendar — that shows `date` attributes, and a state is not a
    // date.
    //
    // It IS in the row context menu's attribute group, beside due and
    // priority. Those all answer "what is this row", and a state you could
    // only reach through the checkbox, Space, or a badge click was the odd one
    // out — the group is how you set an attribute on a whole selection, which
    // none of those do. It opted out back when a raw set/remove there would
    // have skipped the log entry and the clock-out; the host records a
    // transition wherever it came from now, so there is nothing left to
    // protect against.
    metadata: { calendar: false },
  })

  // Status's own log field — declared here because status is what writes it.
  // Each feature owns the `log-*` attributes it records; the log itself owns
  // only `log-date`.
  //
  // The `logStatus` badge below presents it, together with the entry's date —
  // opt out of the catch-all.
  bike.attribute('log-status', {
    title: 'Logged Status',
    type: 'choice',
    choices: STATUS_CHOICES,
    description: 'The state a log entry records.',
    defaultBadge: false,
    // `palette: false`: never OFFERED by the @-palette — these mean nothing
    // typed onto an ordinary row. Entries already carrying them still list.
    metadata: { calendar: false, contextMenu: false, palette: false },
  })

  // Every row carrying a status shows it — all four states, on ANY row type.
  //
  // The states are one closed set, so drawing only some of them would leave the
  // rest to be read off an absence, and "no badge" would have to mean todo,
  // done, and "no status at all" at once. A non-task row has no checkbox to
  // carry that inference in the first place: without this badge a started body
  // row shows nothing.
  //
  // On a task row the badge does repeat what the checkbox already says, and
  // that's the trade taken deliberately: the checkbox is a shortcut the task
  // type adds, not where status lives, so the state reads the same way in the
  // same place whether the row is a task, a heading, or a body row. A row only
  // has a status once something set one, so this is a chip on the rows in play,
  // not on every row in the document.
  bike.badge('status', {
    where: '.@status',
    inputs: { status: '@status' },
    render: (values, env) => {
      // The definition's own display name, so the label can't drift from
      // STATUS_CHOICES — and a value from outside the set (a hand-edited file)
      // falls back to showing itself rather than being relabeled as one of the
      // four.
      const label = env.formatAttribute('status', values['status'] ?? '')
      // A bare `@status` formats to nothing: the definition declares no
      // emptyLabel, so nothing offers it and it has no stated meaning. Draw
      // nothing rather than an empty tag box.
      if (label === '') return null
      return statusTag(env, label)
    },
    // The built-in attribute menu, which for a closed choice IS the four
    // states as radios — plus the filter items and Remove that every other
    // badge offers.
    //
    // This hand-rolled the same radios as `command:status:*` items for a
    // while, because a direct attribute write skipped what `setRowStatus`
    // owned — the log entry, the clock-out on close — and a state change made
    // here would go unrecorded on a row that keeps a history. The host now
    // records a transition wherever it came from, at the end of the
    // transaction that made it, so the menu that writes the attribute keeps
    // history like any other writer and there is nothing left to hand-roll.
    //
    // Note the two ways to reach todo differ in what they STORE, not in what
    // they mean: the Todo radio writes `status=todo`, Remove clears the
    // attribute, and absent reads as todo either way. Both are a transition
    // away from a recorded state, so both log one.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'status' }, 'status'),
  })

  // A state entry, drawn whole: "Today 12:37 PM status = Done".
  //
  // A state entry carries no text — the native writer records the two
  // attributes and nothing else — so this badge IS the entry, and it draws
  // BOTH fields: the date the log owns and the state this feature recorded.
  // That is the rule for log entries generally (see log.ts): `log-date`
  // presents nothing by itself, and whichever feature wrote the entry spells
  // out the whole record, so an entry reads as one line instead of a pair of
  // loose `name:value` chips.
  //
  // `status = ` names the field in the form a query would, and the plain
  // `status` rather than `log-status`: on an entry, the `log-` prefix is what
  // the row already IS.
  bike.badge('logStatus', {
    where: '.@log-status',
    inputs: { status: '@log-status', date: '@log-date' },
    // The date label is now-relative ("Today", then "Yesterday" tomorrow), so
    // it goes stale at midnight without a tick — the same minute tick the
    // catch-all badge runs for exactly this reason.
    tick: 60,
    render: (values, env) => {
      const status = env.formatAttribute('log-status', values['status'] ?? '')
      if (status === '') return null
      const date = values['date']
      // Dateless is still a legible record of a state change. Every entry the
      // log writes carries a date, but one written by hand may not, and half a
      // record beats none.
      const when = date == null || date === '' ? '' : `${env.formatAttribute('log-date', date)} `
      return statusTag(env, `${when}status = ${status}`)
    },
    // What the catch-all badge gave these tags before this one claimed them:
    // the type-aware menu, which for a closed choice is the four states as
    // radios. History is data the user can correct.
    //
    // The built-in menu is right HERE, where the badge above must avoid it:
    // correcting a record is exactly a direct attribute edit. There is nothing
    // to maintain — an entry is not a state, and rewriting one must not append
    // another entry recording that you rewrote it.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'logStatus' }, 'log-status'),
  })
}

// The shared tag for both badges above: a label in the same box the
// due/priority/estimate tags use.
//
// Deliberately NO done-fade, unlike those three: each of these badges IS a
// state — the row's own, or the one an entry records — so fading it on a closed
// row would bury exactly what it exists to say.
function statusTag(env: BadgeEnvironment, label: string): Image {
  const bm = env.badgeMetrics
  return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(0.8))).withBackground({
    stroke: env.color.alphaSet(0.3),
    strokeWidth: bm.strokeWidth,
    cornerRadius: bm.cornerRadius,
    padding: bm.padding,
  })
}

/**
 * Whether a row is closed — done or canceled.
 *
 * Paths say `closed()`; this is the copy for code holding a Row object. No
 * type is special: a row inside a log that someone gave a status genuinely
 * has one, and hiding that would be the kind of mystery the design avoids.
 */
export function isClosed(row: { getAttribute(name: string): string | undefined }): boolean {
  const status = row.getAttribute('status')
  return status === 'done' || status === 'canceled'
}
