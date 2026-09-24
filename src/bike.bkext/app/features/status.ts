import { Disposable } from 'bike/app'
import { attributeTag } from './helpers'

// The `status` feature: a row's state, on any row; absent means todo. Queries
// use native `open()`/`closed()` rather than spelling out states, so a new
// state can't open holes. Commands are native; the host logs transitions (and
// stops clocks) at the end of any transaction that writes the attribute.

// Shared by `status` and `log-status` so they can't drift.
const STATUS_CHOICES = [
  { name: 'Todo', value: 'todo' },
  { name: 'Started', value: 'started' },
  { name: 'Canceled', value: 'canceled' },
  { name: 'Done', value: 'done' },
]

export function registerStatus() {
  bike.attribute('status', {
    title: 'Status',
    // `open()`/`closed()` are defined over exactly these four.
    type: 'choice',
    choices: STATUS_CHOICES,
    description: 'A row\u2019s state. Absent means todo.',
    defaultBadge: false,
    metadata: { calendar: false },
  })

  // Not needed for recording; declared so the log badge formats and edits it
  // as a choice.
  bike.attribute('log-status', {
    title: 'Logged Status',
    type: 'choice',
    choices: STATUS_CHOICES,
    description: 'The state a log entry records.',
    defaultBadge: false,
    // Recorded by the log, see `log-date` in log.ts.
    metadata: { calendar: false, user: false },
  })

  // `where` is fixed at registration, and the badge memo keys on
  // (name, values, font), so a settings change must re-register.
  let badge = installStatusBadge()
  bike.defaults.observe('hideDoneBadgeOnTasks', () => {
    badge.dispose()
    badge = installStatusBadge()
  })
}

/** Exported for tests. */
export function statusBadgeWhere(hideDoneOnTasks: boolean): string {
  return hideDoneOnTasks ? `.${HIDE_DONE_ON_TASKS_PREDICATE}` : '.@status'
}

/** Has a status, except a done task. Parens required: `not` is greedy. */
export const HIDE_DONE_ON_TASKS_PREDICATE = '@status and not (@type = task and @status = done)'

// Shows all four states on any row type. `hideDoneBadgeOnTasks` drops it only
// for done tasks; canceled keeps it since the checkbox is binary.
function installStatusBadge(): Disposable {
  // `=== true`: runs before registerTasks() registers the default, so this may
  // read undefined, which must mean off.
  return bike.badge('status', {
    where: statusBadgeWhere(bike.defaults.get('hideDoneBadgeOnTasks') === true),
    inputs: { status: '@status' },
    render: (values, env) => {
      const label = env.formatAttribute('status', values['status'] ?? '')
      // A bare `@status` formats to nothing (no emptyLabel).
      if (label === '') return null
      return attributeTag(env, label)
    },
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'status' }, 'status'),
  })
}

/** Done or canceled; the Row-object copy of `closed()`. */
export function isClosed(row: { getAttribute(name: string): string | undefined }): boolean {
  const status = row.getAttribute('status')
  return status === 'done' || status === 'canceled'
}
