import { BadgeEnvironment, Color, CommandContext, Disposable, Image, Path, Point, Rect, Row, Shape, Text } from 'bike/app'
import { progressDefaults } from '../../dom/protocols'

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
  // `summary('...')` from the badge inputs below.
  bike.summary('todo', { where: '.task', reduce: 'count' })
  bike.summary('done', { where: '.@done', reduce: 'count' })

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
      editor.showMenu(row, {
        items: [
          { type: 'button', id: 'show-todos', title: 'Filter not @done' },
          { type: 'button', id: 'show-completed', title: 'Filter @done' },
          { type: 'separator' },
          { type: 'button', id: 'command:progress:mark-branch-done', title: 'Mark Branch Tasks Done', enabled: done !== tasks.length },
          { type: 'button', id: 'command:progress:clear-branch-done', title: 'Clear Branch Tasks Done', enabled: done !== 0 },
        ],
        anchor: 'progress',
        onAction: (id, { editor, row }) => {
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

// A pie glyph: the `done/total` fraction drawn as a filled wedge on a
// transparent background, ringed by a border that matches every other drawn
// badge on the row. Sized to the shared badge rect and tinted from the
// outline's base text color so it reads as chrome like the fraction glyph.
function pieImage(fraction: number, env: BadgeEnvironment): Image {
  const side = env.badgeMetrics.side
  const f = Math.max(0, Math.min(1, fraction))
  const rect = new Rect(0, 0, side, side)
  const center = new Point(side / 2, side / 2)
  const radius = side / 2
  const sw = env.badgeMetrics.strokeWidth
  // The done circle sits 1pt inside the border's inner edge, so a complete pie
  // reads as: border ring, a 1pt transparent gap, then a filled circle in the
  // border color. (Border stroke is centered on `radius`, inner edge = radius − sw/2.)
  const wedgeRadius = radius - sw / 2 - 1

  const wedgePath = new Path()
  // Start at 12 o'clock and sweep CLOCKWISE by the completed fraction. This
  // render space is y-up (angles increase counter-clockwise, +y is screen-up),
  // so noon is +π/2 and a NEGATIVE relative-arc delta sweeps clockwise on screen.
  const start = Math.PI / 2
  wedgePath.moveTo(center)
  wedgePath.addRelativeArc(center, wedgeRadius, start, -f * 2 * Math.PI)
  wedgePath.closeSubpath()
  // The badge draws by rendering each shape to its OWN image sized to the path's
  // bounding box, then `withComposite` centers those images together. A partial
  // wedge's bbox is only the swept sliver (offset from the circle), so centering
  // shifts it off the border — a small fraction renders like an empty/full disc.
  // Pin the wedge's bbox to the full badge rect so it shares the border's canvas
  // center and compositing aligns them exactly. Empty `moveTo` subpaths get
  // dropped, so anchor with zero-length line segments at the circle's four
  // cardinal points — they sit under the border ring and add no visible fill.
  const eps = 0.01
  for (const [x, y, dx, dy] of [
    [side / 2, 0, 0, eps],
    [side, side / 2, -eps, 0],
    [side / 2, side, 0, -eps],
    [0, side / 2, eps, 0],
  ]) {
    wedgePath.moveTo(new Point(x, y))
    wedgePath.addLineTo(new Point(x + dx, y + dy))
  }
  const wedge = new Shape(wedgePath)
  // Done fill at twice the border's opacity, so the wedge reads a bit darker
  // than the ring around it.
  wedge.fill.color = env.color.alphaSet(0.5)
  wedge.stroke.color = Color.clear()

  // A border ring matching the default drawn-badge border (`env.color` at 0.3,
  // `badgeMetrics.strokeWidth`) — the same color as the done circle — composited
  // last so it stays crisp over the wedge rather than being half-covered by it.
  const border = new Shape(Path.ellipseInRect(rect))
  border.fill.color = Color.clear()
  border.stroke.color = env.color.alphaSet(0.3)
  border.line.width = sw

  return Image.fromShape(wedge).withComposite(Image.fromShape(border))
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
