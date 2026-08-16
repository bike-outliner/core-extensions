import { Image, Text } from 'bike/app'

// The `status` feature: a task's state, and the attributes its optional
// history uses.
//
// One field holds the state — todo | started | done | canceled — so no
// combination of stored values can describe two states at once. The
// open/closed split is what queries actually ask about, and it is a native
// path function (`open()` / `closed()`) rather than something spelled out per
// call site: written as "not done and not canceled", every one of those
// predicates would quietly acquire a hole the day a fifth state is added.
//
// The commands live in the host (`task:toggle-done`, `task:toggle-canceled`,
// `task:toggle-started`, and the log/clock pair) because the checkbox, the
// Space key, and the sort-completed-to-end behavior are all native.

export function registerStatus() {
  bike.attribute('status', {
    title: 'Status',
    // Closed: these four are the whole vocabulary, and `open()`/`closed()`
    // are defined over exactly them.
    type: 'choice',
    choices: [
      { name: 'Todo', value: 'todo' },
      { name: 'Started', value: 'started' },
      { name: 'Done', value: 'done' },
      { name: 'Canceled', value: 'canceled' },
    ],
    description: 'Task state. Absent means todo.',
    // The badge below presents this attribute, and only for the two states
    // the checkbox cannot show — opt out of the catch-all.
    defaultBadge: false,
    // The calendar shows every `date` attribute, and the row context menu
    // lists every declared attribute. Neither applies here: status is not a
    // date, and the toggles already own changing it, so a submenu of raw
    // set/remove would only duplicate them, worse.
    metadata: { calendar: false, contextMenu: false },
  })

  // The two attributes a log entry carries. Every entry has `date`; a state
  // entry adds `status`, a finished clock adds `duration`, and a running
  // clock has neither. Nothing may assume more than `date` is present.
  bike.attribute('date', {
    title: 'Date',
    type: 'date',
    description: 'When a log entry happened.',
    defaultBadge: false,
    // A log entry is history. On the calendar every completed task would land
    // on its completion day and drown the schedule — the same reason the old
    // `done` attribute opted out.
    metadata: { calendar: false, contextMenu: false },
  })

  bike.attribute('duration', {
    title: 'Duration',
    type: 'duration',
    description: 'Time recorded by a clock entry. Absent means the clock is still running.',
    defaultBadge: false,
    metadata: { calendar: false, contextMenu: false },
  })

  // Only the two states the checkbox cannot express. Todo and done are
  // already legible — an empty box and a checked one — so badging them would
  // add noise to every task in the document.
  bike.badge('status', {
    where: '.task (@status = started or @status = canceled)',
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
 * Paths say `closed()`; this is for the two places that hold a Row object
 * instead. Log entries are excluded for the same reason the path function
 * excludes them: a state entry carries `status=done` but records a state
 * rather than having one.
 */
export function isClosed(row: { type?: string; getAttribute(name: string): string | undefined }): boolean {
  if (row.type === 'log') return false
  const status = row.getAttribute('status')
  return status === 'done' || status === 'canceled'
}
