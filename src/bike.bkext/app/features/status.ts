import { Image, Text } from 'bike/app'

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
// because the checkbox, the Space key, the log recording, and the
// sort-completed-to-end behavior are all native.

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
    // The badge below presents this attribute, and only for the two states
    // the checkbox cannot show — opt out of the catch-all.
    defaultBadge: false,
    // The calendar shows every `date` attribute, and the row context menu
    // lists every declared attribute. Neither applies here: status is not a
    // date, and the commands already own changing it, so a submenu of raw
    // set/remove would only duplicate them, worse.
    metadata: { calendar: false, contextMenu: false },
  })

  // Status's own log field — declared here because status is what writes it.
  // Each feature owns the `log-*` attributes it records; the log itself owns
  // only `log-date`. Registered rather than left loose: an unregistered
  // attribute is unclaimed, so the catch-all badge would draw a raw tag on
  // every entry.
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

  // Only the two states the checkbox cannot express, and on ANY row: a
  // non-task row has no checkbox at all, so this badge is its only indicator
  // — without it a started body row shows nothing. Todo and done are already
  // legible (empty box, checked box, strikethrough), so badging them would
  // put a chip on every row in the document.
  bike.badge('status', {
    where: '.(@status = started or @status = canceled)',
    inputs: { status: '@status' },
    render: (values, env) => {
      const bm = env.badgeMetrics
      const label = values['status'] === 'canceled' ? 'Canceled' : 'Started'
      // Deliberately NO done-fade here, unlike the due/priority/estimate
      // badges: this badge IS the signal that the row is canceled, so fading
      // it on a closed row would bury exactly what it exists to say.
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(0.8)))
        .withBackground({
          stroke: env.color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'status' }, 'status'),
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
