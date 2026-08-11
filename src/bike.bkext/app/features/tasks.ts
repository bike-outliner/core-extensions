import { CommandContext, Disposable, Image, Row, Text } from 'bike/app'
import { taskDefaults } from '../../dom/protocols'
import { pieImage } from '../pie-image'
import { doneStamp } from './done'

// A "tasks" feature demonstrating subtree summaries: two incrementally
// maintained branch aggregates (total tasks / done tasks below a row), consumed
// by a badge that shows "done/total" on any row that has a task somewhere
// below. Clicking the badge shows a menu whose every item dispatches one of
// this feature's four commands — the two branch filters and the two branch
// done commands.
//
// Whether the badge draws at all is `showTaskProgressBadges` (on by default),
// and how it draws — a typographic "done/total" fraction or a pie chart — is
// `taskProgressBadgeType` ('fraction' by default). Both are extension defaults
// set in Settings > Extensions > Tasks (dom/TasksSettings.tsx).

export function registerTasks() {
  bike.commands.addCommands({
    commands: {
      'tasks:mark-branch-done': markBranchDone,
      'tasks:clear-branch-done': clearBranchDone,
      'tasks:filter-todo': filterBranchTasks('not @done', 'Todo Tasks'),
      'tasks:filter-done': filterBranchTasks('@done', 'Done Tasks'),
    },
  })

  bike.defaults.registerDefaults(taskDefaults)

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
  // runtime change from the Settings panel can't refresh already-drawn badges on
  // its own. Re-register on change to hand the badge a fresh render closure and
  // force a restyle.
  let badge = installBadge()
  function reinstall() {
    badge?.dispose()
    badge = installBadge()
  }
  bike.defaults.observe('showTaskProgressBadges', reinstall)
  bike.defaults.observe('taskProgressBadgeType', reinstall)
}

/** The task progress badge in the current style, or nothing at all when badges
 * are switched off — leaving it unregistered rather than rendering null, so its
 * `where` clause isn't evaluated for every visible row on every style pass. */
function installBadge(): Disposable | undefined {
  if (bike.defaults.get('showTaskProgressBadges') === false) return undefined
  // Anything but an explicit 'pie' draws the fraction — the registered default.
  const fraction = bike.defaults.get('taskProgressBadgeType') !== 'pie'

  return bike.badge('tasks', {
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
      // The style is captured at registration, not read here: a change
      // re-registers (above), and reading it per row per style pass would be
      // work for a value that cannot have changed since.
      if (!fraction) {
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
      // Every item is a `command:` id — the menu picks WHICH commands to offer
      // and when they're enabled, and the commands themselves own the doing.
      // The two filters scope to the clicked row because the click selects it
      // (they read the selection, same as the two branch commands).
      editor.showMenu({ row, anchor: 'tasks' }, {
        items: [
          { type: 'button', id: 'command:tasks:filter-todo', title: 'Filter not @done' },
          { type: 'button', id: 'command:tasks:filter-done', title: 'Filter @done' },
          { type: 'separator' },
          { type: 'button', id: 'command:tasks:mark-branch-done', title: 'Mark Branch Tasks Done', enabled: done !== tasks.length },
          { type: 'button', id: 'command:tasks:clear-branch-done', title: 'Clear Branch Tasks Done', enabled: done !== 0 },
        ],
      })
    },
  })
}

// Filter to the tasks in the selected row's branch matching `predicate`.
//
// Task-scoped and branch-scoped, so the two filters partition exactly the set
// the badge's fraction counts. Not `filterCommand` from ./helpers: that one
// filters the WHOLE outline from home with an empty-set alert, and these are
// deliberately a narrower thing — a filter *into* one branch, which is what
// the badge menu has always done.
function filterBranchTasks(predicate: string, label: string) {
  return ({ editor, selection }: CommandContext): boolean => {
    const row = selection?.rows[0]
    if (!editor || !row) return false
    editor.filter = { label, path: `//@id = "${row.ensuredPersistentId}"//task ${predicate}` }
    return true
  }
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
