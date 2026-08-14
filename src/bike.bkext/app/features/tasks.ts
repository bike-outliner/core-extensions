import { CommandContext, Disposable, Image, Outline, Row, Text } from 'bike/app'
import { taskDefaults } from '../../dom/protocols'
import { pieImage } from '../pie-image'
import { doneStamp } from './done'

// A "tasks" feature demonstrating subtree summaries: two incrementally
// maintained branch aggregates (total tasks / done tasks below a row), consumed
// by a badge that shows "done/total" on any row that has a task somewhere
// below. Clicking the badge shows a menu whose every item dispatches one of
// this feature's six commands — the two branch filters, the two branch done
// commands, and the branch half of the archive pair.
//
// Archiving is the one thing here that MOVES rows rather than editing an
// attribute, and it comes in two scopes because a command takes no arguments
// beyond its editor and selection: `tasks:archive-done` sweeps the whole
// outline, `tasks:archive-branch-done` sweeps one branch, and the badge menu
// offers the branch one.
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
      'tasks:archive-done': archiveDone,
      'tasks:archive-branch-done': archiveBranchDone,
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
      // Every item here scopes to the clicked row because the click selects it —
      // the filters, the branch done commands and the branch archive all read
      // the selection, not this `row`.
      editor.showMenu({ row, anchor: 'tasks' }, {
        items: [
          { type: 'button', id: 'command:tasks:filter-todo', title: 'Filter not @done' },
          { type: 'button', id: 'command:tasks:filter-done', title: 'Filter @done' },
          { type: 'separator' },
          { type: 'button', id: 'command:tasks:mark-branch-done', title: 'Mark Branch Tasks Done', enabled: done !== tasks.length },
          { type: 'button', id: 'command:tasks:clear-branch-done', title: 'Clear Branch Tasks Done', enabled: done !== 0 },
          { type: 'separator' },
          // The `done` count above is TASKS done, and archiving takes any @done
          // row — so this asks the archive command's own helper what it would
          // move rather than reusing that number. Same answer as the command,
          // so the item can't be enabled when the command would decline.
          {
            type: 'button',
            id: 'command:tasks:archive-branch-done',
            title: 'Archive Branch Done',
            enabled: doneRowsToArchive(editor.outline, [row]).length > 0,
          },
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

// Move every done row in the outline into its Archive, creating the Archive if
// it doesn't exist yet.
function archiveDone({ editor }: CommandContext): boolean {
  if (!editor) return false
  return archiveInto(editor.outline, doneRowsToArchive(editor.outline))
}

// The same sweep over the selected rows' branches only — what the badge menu
// offers, where the clicked row is the branch whose progress is being reported.
function archiveBranchDone({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  return archiveInto(editor.outline, doneRowsToArchive(editor.outline, rows))
}

// The rows an archive command would move: everything carrying `done` that isn't
// in the Archive already, narrowed to the branches under `scope` when given.
//
// Any @done row, not just tasks — a checked-off note is finished work too, and
// leaving it behind while its siblings archive would strand it. (This is the one
// place the feature looks past `.task`; the summaries and the two branch done
// commands stay task-only, because those measure task PROGRESS.)
//
// DESCENDANTS, not descendantsWithSelf, for a scope: the clicked row is the
// container the badge reports on, so archiving it would make the row you just
// clicked vanish. Same targeting as `filterBranchTasks` above, whose path
// `//@id = "…"//task` is likewise descendants-only.
function doneRowsToArchive(outline: Outline, scope?: Row[]): Row[] {
  const archiveId = outline.getRowById(ARCHIVE_ID)?.id
  const candidates = scope
    ? scope.flatMap((row) => row.descendants).filter((row) => row.getAttribute('done') != null)
    : // `except //@id = archive//*` does the archive exclusion natively rather
      // than walking every row in the document across the JS bridge; the JS
      // filters below still run, and are no-ops for what this already dropped.
      (outline.query(`//@done except //@id = ${ARCHIVE_ID}//*`).value as Row[])

  // Row objects are wrappers over native rows and aren't identity-stable across
  // bridge calls, so every comparison here is by `id` — same reason
  // `branchTasks` dedupes on ids.
  const seen = new Set<number>()
  const done = candidates.filter(
    (row) =>
      row.id !== archiveId &&
      !row.ancestors.some((ancestor) => ancestor.id === archiveId) &&
      !seen.has(row.id) &&
      (seen.add(row.id), true)
  )

  // Outermost only. A done row nested under another done row rides along inside
  // its branch; moving both would lift the child out to sit BESIDE its parent in
  // the Archive, flattening the branch. Rows that aren't done but hang under one
  // that is travel with it too — that's what archiving a finished branch means.
  return done.filter((row) => !row.ancestors.some((ancestor) => seen.has(ancestor.id)))
}

// Move `rows` into the Archive in one undo step, or decline.
//
// Declining on an empty set is the house contract (see ./helpers): no empty
// transaction on the undo stack, and false lets a keybinding fall through. It
// also means an archive sweep with nothing to sweep never leaves a bare Archive
// row behind, since the row is created inside the transaction.
function archiveInto(outline: Outline, rows: Row[]): boolean {
  if (rows.length === 0) return false
  outline.transaction({ label: 'Archive Done', animate: 'default' }, () => {
    // No `before`, so successive sweeps stack at the end of the Archive.
    outline.moveRows(rows, ensureArchiveRow(outline))
  })
  return true
}

// The outline's Archive row, created as the last child of root when missing.
//
// Keyed by persistent id, not by its text: the row is the user's to rename, move
// and refile, and it stays the Archive through all of it.
function ensureArchiveRow(outline: Outline): Row {
  return (
    outline.getRowById(ARCHIVE_ID) ??
    outline.insertRows([{ persistentId: ARCHIVE_ID, text: 'Archive' }], outline.root)[0]
  )
}

const ARCHIVE_ID = 'archive'

// Every task row in the branches rooted at `rows`, deduplicated so nested or
// overlapping selections don't visit a task twice.
function branchTasks(rows: Row[]): Row[] {
  const seen = new Set<number>()
  return rows
    .flatMap((row) => row.descendantsWithSelf)
    .filter((row) => row.type === 'task' && !seen.has(row.id) && (seen.add(row.id), true))
}
