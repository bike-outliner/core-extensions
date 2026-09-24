import { CommandContext, Disposable, Image, Outline, Row, Text } from 'bike/app'
import { taskDefaults } from '../../dom/protocols'
import { pieImage } from '../pie-image'
import { isClosed } from './status'

// Tasks feature: branch summaries of open/done tasks drive a "done/total"
// badge whose menu dispatches this feature's commands. Archive comes in two
// scopes (outline, branch) because commands take no arguments.
// Settings > Extensions > Tasks (dom/TasksSettings.tsx) also drives
// `hideDoneBadgeOnTasks`, which is read in ./status.

export function registerTasks() {
  bike.commands.addCommands({
    commands: {
      'task:mark-branch-done': markBranchDone,
      'task:reopen-branch': reopenBranch,
      'task:filter-open': filterBranchTasks('open()', 'Open Tasks'),
      'task:filter-closed': filterBranchTasks('closed()', 'Closed Tasks'),
      'task:archive-closed': archiveClosed,
      'task:archive-branch-closed': archiveBranchClosed,
    },
  })

  bike.defaults.registerDefaults(taskDefaults)

  // Canceled tasks are in neither: out of scope, not complete, so the total is
  // open + done. (`.task open()` juxtaposes; a type token can't join with `and`.)
  bike.summary('open', { where: '.task open()', reduce: 'count' })
  bike.summary('done', { where: '.task @status = done', reduce: 'count' })

  // `render` memoizes on `env`, which doesn't include these settings, so
  // re-register on change to force a restyle.
  let badge = installBadge()
  function reinstall() {
    badge?.dispose()
    badge = installBadge()
  }
  bike.defaults.observe('showTaskProgressBadges', reinstall)
  bike.defaults.observe('taskProgressBadgeType', reinstall)
}

/** Unregistered when switched off, so `where` isn't evaluated every style pass. */
function installBadge(): Disposable | undefined {
  if (bike.defaults.get('showTaskProgressBadges') === false) return undefined
  const fraction = bike.defaults.get('taskProgressBadgeType') !== 'pie'

  return bike.badge('tasks', {
    // Summaries are O(1); `.//task` would be rejected at registration. A task
    // counts itself, so tasks only show progress when count > 1.
    where: '.(summary("open") + summary("done")) > 0 and ((not @type = task) or (summary("open") + summary("done")) > 1)',
    inputs: { done: 'summary("done")', open: 'summary("open")' },
    render: (values, env) => {
      const done = values['done'] ?? '0'
      const total = String(Number(values['open'] ?? '0') + Number(done))
      if (!fraction) {
        const doneNum = Number(done)
        const totalNum = Number(total)
        if (totalNum > 0) {
          return pieImage(doneNum / totalNum, env)
        }
      }
      // Plain solidus with `frac`: U+2044 conflicts with `frac` in SF.
      return Image.fromText(new Text(`${done}/${total}`, env.font.withFractions(), env.color.alphaSet(0.5)))
    },
    onClick: ({ editor, row }) => {
      // Summary values aren't readable per-row from JS, so walk the branch.
      const tasks = branchTasks([row])
      const closed = tasks.filter((task) => isClosed(task)).length
      // Commands read the selection, which the click has set to `row`.
      editor.showMenu({ row, anchor: 'tasks' }, {
        items: [
          { type: 'button', id: 'command:task:filter-open', title: 'Filter Open' },
          { type: 'button', id: 'command:task:filter-closed', title: 'Filter Closed' },
          { type: 'separator' },
          { type: 'button', id: 'command:task:mark-branch-done', title: 'Mark Branch Tasks Done', enabled: closed !== tasks.length },
          { type: 'button', id: 'command:task:reopen-branch', title: 'Reopen Branch Tasks', enabled: closed !== 0 },
          { type: 'separator' },
          // Archive takes any closed row, not just tasks, so ask its helper.
          {
            type: 'button',
            id: 'command:task:archive-branch-closed',
            title: 'Archive Branch Closed',
            enabled: closedRowsToArchive(editor.outline, [row]).length > 0,
          },
        ],
      })
    },
  })
}

// Filters the selected row's branch tasks; not ./helpers `filterCommand`,
// which filters the whole outline.
function filterBranchTasks(predicate: string, label: string) {
  return ({ editor, selection }: CommandContext): boolean => {
    const row = selection?.rows[0]
    if (!editor || !row) return false
    editor.filter = { label, path: `//@id = "${row.ensurePersistentId()}"//task ${predicate}` }
    return true
  }
}

// Canceled tasks are left alone. A plain attribute write: the host derives
// logging and clock stops from the transition. Doesn't apply
// `sortCompletedTasksToEnd`, an editor keystroke preference.
function markBranchDone({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  const tasks = branchTasks(rows).filter((task) => !isClosed(task))
  if (tasks.length === 0) return false
  editor.outline.transaction({ label: 'Mark Branch Tasks Done' }, () => {
    for (const task of tasks) task.setAttribute('status', 'done')
  })
  return true
}

// Reopens done and canceled tasks; clears the attribute since absent is todo.
function reopenBranch({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  const tasks = branchTasks(rows).filter((task) => isClosed(task))
  if (tasks.length === 0) return false
  editor.outline.transaction({ label: 'Reopen Branch Tasks' }, () => {
    for (const task of tasks) task.removeAttribute('status')
  })
  return true
}

function archiveClosed({ editor }: CommandContext): boolean {
  if (!editor) return false
  return archiveInto(editor.outline, closedRowsToArchive(editor.outline))
}

function archiveBranchClosed({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  return archiveInto(editor.outline, closedRowsToArchive(editor.outline, rows))
}

// Closed rows (any type, not just tasks) outside the Archive, optionally
// within `scope`'s descendants. Excludes the scope rows themselves so the
// clicked row doesn't vanish. `closed()` is false for log rows.
function closedRowsToArchive(outline: Outline, scope?: Row[]): Row[] {
  const archiveId = outline.getRowById(ARCHIVE_ID)?.id
  const candidates = scope
    ? scope.flatMap((row) => row.descendants).filter((row) => isClosed(row))
    : // Excludes the archive natively rather than across the JS bridge.
      (outline.query(`//closed() except //@id = ${ARCHIVE_ID}//*`).value as Row[])

  // Row wrappers aren't identity-stable across bridge calls; compare by `id`.
  const seen = new Set<number>()
  const done = candidates.filter(
    (row) =>
      row.id !== archiveId &&
      !row.ancestors.some((ancestor) => ancestor.id === archiveId) &&
      !seen.has(row.id) &&
      (seen.add(row.id), true)
  )

  // Outermost only; moving nested ones too would flatten the branch.
  return done.filter((row) => !row.ancestors.some((ancestor) => seen.has(ancestor.id)))
}

// Declines on an empty set, so no empty undo step or bare Archive row.
function archiveInto(outline: Outline, rows: Row[]): boolean {
  if (rows.length === 0) return false
  outline.transaction({ label: 'Archive Done', animate: 'default' }, () => {
    outline.moveRows(rows, ensureArchiveRow(outline))
  })
  return true
}

// Keyed by persistent id, not text, so the user can rename or move it.
function ensureArchiveRow(outline: Outline): Row {
  return (
    outline.getRowById(ARCHIVE_ID) ??
    outline.insertRows([{ persistentId: ARCHIVE_ID, text: 'Archive' }], outline.root)[0]
  )
}

const ARCHIVE_ID = 'archive'

// Deduplicated for nested or overlapping selections.
function branchTasks(rows: Row[]): Row[] {
  const seen = new Set<number>()
  return rows
    .flatMap((row) => row.descendantsWithSelf)
    .filter((row) => row.type === 'task' && !seen.has(row.id) && (seen.add(row.id), true))
}
