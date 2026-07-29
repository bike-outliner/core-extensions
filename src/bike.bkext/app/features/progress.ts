import { CommandContext, Disposable, Image, Row, Text } from 'bike/app'
import { progressDefaults } from '../../dom/protocols'
import { pieImage } from '../pie-image'
import { doneStamp } from './done'

// A "progress" feature demonstrating subtree summaries: two incrementally
// maintained branch aggregates (total tasks / done tasks below a row), consumed
// by a badge that shows "done/total" on any row that has a task somewhere
// below. Clicking the badge shows a menu with Show Done / Show Remaining
// filters and Set / Clear Branch Done commands.
//
// The badge renders either as a typographic "done/total" fraction or as a pie
// chart, controlled by the `progressStyle` extension default ('pie' by
// default). A Settings panel (dom/Settings.tsx) toggles it.

export function registerProgress() {
  bike.commands.addCommands({
    commands: {
      'progress:mark-branch-done': markBranchDone,
      'progress:clear-branch-done': clearBranchDone,
    },
  })

  bike.defaults.registerDefaults(progressDefaults)
  bike.settings.addItem({ label: 'Progress', script: 'Settings.js' })

  // Self-only contributions folded up every branch by `count`; read O(1) as
  // `summary('...')` from the badge inputs below. Both count the SAME unit —
  // task rows — so done can never exceed total: a non-task row marked @done
  // (any row can be) is completion history, not task progress, and counting
  // it would overfill the pie.
  // (`.task @done` is type-then-predicate juxtaposition — a type token can't
  // join a predicate with `and`, same grammar as the `//task not @done` filter.)
  bike.summary('todo', { where: '.task', reduce: 'count' })
  bike.summary('done', { where: '.task @done', reduce: 'count' })

  // `render` memoizes on `env`, and the display mode isn't part of `env` — so a
  // runtime toggle from the Settings panel can't refresh already-drawn badges on
  // its own. Re-register on change to hand the badge a fresh render closure and
  // force a restyle. (`render` also reads the default live, so freshly styled
  // rows reflect the current mode regardless.)
  let badge = installBadge()
  bike.defaults.observe('progressStyle', () => {
    badge.dispose()
    badge = installBadge()
  })
}

function installBadge(): Disposable {
  return bike.badge('progress', {
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
      // Pie is the default: anything but an explicit 'fraction' draws the pie
      // (matches the Settings panel's checkbox, which is on unless 'fraction').
      if (bike.defaults.get('progressStyle') !== 'fraction') {
        const doneNum = Number(done)
        const totalNum = Number(total)
        if (totalNum > 0) {
          return pieImage(doneNum / totalNum, env)
        }
      }
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
      editor.showMenu({ row, anchor: 'progress' }, {
        items: [
          { type: 'button', id: 'show-todos', title: 'Filter not @done' },
          { type: 'button', id: 'show-completed', title: 'Filter @done' },
          { type: 'separator' },
          { type: 'button', id: 'command:progress:mark-branch-done', title: 'Mark Branch Tasks Done', enabled: done !== tasks.length },
          { type: 'button', id: 'command:progress:clear-branch-done', title: 'Clear Branch Tasks Done', enabled: done !== 0 },
        ],
        onAction: (id) => {
          const pid = row.ensuredPersistentId
          if (id === 'show-completed') {
            // Task-scoped, like the summaries and 'show-todos' — the two
            // filters partition the same set the badge's fraction counts.
            editor.filter = { label: "Done Tasks", path: `//@id = "${pid}"//task @done` }
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
  const now = doneStamp()
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
