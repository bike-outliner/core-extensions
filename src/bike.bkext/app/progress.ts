import { CommandContext, Image, Row, Text } from 'bike/app'

// A "progress" feature demonstrating subtree summaries: two incrementally
// maintained branch aggregates (total tasks / done tasks below a row), consumed
// by a badge that shows "done/total" on any row that has a task somewhere
// below. Clicking the badge shows a menu with Show Done / Show Remaining
// filters and Set / Clear Branch Done commands.

export function registerProgress() {
  bike.commands.addCommands({
    commands: {
      'progress:mark-branch-done': markBranchDone,
      'progress:clear-branch-done': clearBranchDone,
    },
  })

  // Self-only contributions folded up every branch by `count`; read O(1) as
  // `summary('...')` from the badge inputs below.
  bike.summary('todo', { where: '.task', reduce: 'count' })
  bike.summary('done', { where: '.@done', reduce: 'count' })

  bike.badge('progress', {
    // Rows with a task in their subtree — via the summary, an O(1) read (a
    // descendant search like `.//task` would walk each visible row's subtree
    // every style pass, and is rejected at registration). A task LEAF's
    // subtree count is just itself, so tasks only show progress when they
    // contain further tasks (count > 1).
    where: '.summary("todo") > 0 and ((not @type = task) or summary("todo") > 1)',
    inputs: { done: 'summary("done")', total: 'summary("todo")' },
    render: (values, env) => {
      const done = values['done'] ?? '0'
      const total = values['total'] ?? '0'
      // A plain solidus + the OpenType `frac` feature renders this as a true
      // diagonal fraction: raised numerator, denominator dropped to the
      // baseline. (The U+2044 fraction slash conflicts with `frac` in SF and
      // leaves the denominator at superior height — use the solidus.)
      return Image.fromText(new Text(`${done}/${total}`, env.font.withFractions(), env.color.alphaSet(0.5)))
    },
    onClick: ({ editor, row }) => {
      // The menu is built at click time from the row itself. Summary values
      // aren't readable per-row from JS, so recompute done/total with a
      // one-shot branch walk — cheap for a single click, and only needed
      // for the enabled: flags.
      const tasks = branchTasks([row])
      const done = tasks.filter((task) => task.getAttribute('done') != null).length
      editor.showMenu(row, {
        items: () => [
          { type: 'button', id: 'show-todos', title: 'Branch Todos', symbol: 'line.3.horizontal.decrease' },
          { type: 'button', id: 'show-completed', title: 'Branch Completed', symbol: 'line.3.horizontal.decrease' },
          { type: 'separator' },
          { type: 'button', id: 'command:progress:mark-branch-done', title: 'Mark Branch Done', symbol: 'checkmark.square', enabled: done !== tasks.length },
          { type: 'button', id: 'command:progress:clear-branch-done', title: 'Clear Branch Done', symbol: 'square', enabled: done !== 0 },
        ],
        anchor: 'progress',
        onAction: (id, _value, { editor, row }) => {
          const pid = row.ensuredPersistentId
          if (id === 'show-completed') {
            editor.filter = { label: "Done Tasks", path: `//@id = "${pid}"//@done` }
          } else if (id === 'show-todos') {
            editor.filter = { label: "Todo Tasks", path: `//@id = "${pid}"//task not @done` }
          }
        },
      })
    },
  })
}

// Set `done` on every open task in the selected rows' branches, in one undo
// step. Rows already done keep their original completion timestamps.
function markBranchDone({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  const tasks = branchTasks(rows).filter((task) => task.getAttribute('done') == null)
  if (tasks.length === 0) return false
  // The same `done` value the native Toggle Done stamps: an ISO-8601 UTC
  // timestamp without fractional seconds.
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  editor.outline.transaction({ label: 'Set Branch Done' }, () => {
    for (const task of tasks) task.setAttribute('done', now)
  })
  return true
}

// Remove `done` from every task in the selected rows' branches.
function clearBranchDone({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  const tasks = branchTasks(rows).filter((task) => task.getAttribute('done') != null)
  if (tasks.length === 0) return false
  editor.outline.transaction({ label: 'Clear Branch Done' }, () => {
    for (const task of tasks) task.removeAttribute('done')
  })
  return true
}

// Every task row in the branches rooted at `rows`, deduplicated so nested or
// overlapping selections don't visit a task twice.
function branchTasks(rows: Row[]): Row[] {
  const seen = new Set<number>()
  return rows
    .flatMap((row) => row.descendantsWithSelf)
    .filter((row) => row.type === 'task' && !seen.has(row.id) && (seen.add(row.id), true))
}
