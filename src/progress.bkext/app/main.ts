import { AppExtensionContext, Image, Text } from 'bike/app'

// A "progress" feature demonstrating subtree summaries: two incrementally
// maintained branch aggregates (total tasks / done tasks below a row), consumed
// by a badge that shows "done/total" on any row that has a task somewhere below.

export async function activate(context: AppExtensionContext) {
  // Self-only contributions folded up every branch by `count`; read O(1) as
  // `summary('...')` from the badge inputs below.
  bike.summary('tasks', { where: '.task', reduce: 'count' })
  bike.summary('doneTasks', { where: '.task @done', reduce: 'count' })

  bike.badge('progress', {
    // Rows with a task in their subtree — via the summary, an O(1) read (a
    // descendant search like `.//task` would walk each visible row's subtree
    // every style pass, and is rejected at registration). A task LEAF's
    // subtree count is just itself, so tasks only show progress when they
    // contain further tasks (count > 1).
    where: '.summary("tasks") > 0 and ((not @type = task) or summary("tasks") > 1)',
    inputs: { done: 'summary("doneTasks")', total: 'summary("tasks")' },
    render: (values, env) => {
      const done = values['done'] ?? '0'
      const total = values['total'] ?? '0'
      return {
        // A plain solidus + the OpenType `frac` feature renders this as a true
        // diagonal fraction: raised numerator, denominator dropped to the
        // baseline. (The U+2044 fraction slash conflicts with `frac` in SF and
        // leaves the denominator at superior height — use the solidus.)
        image: Image.fromText(
          new Text(`${done}/${total}`, env.font.withFractions(), env.color.alphaSet(0.6)),
        ),
        items: [
          { kind: 'action', id: 'show-done', title: 'Show Done Tasks' },
          { kind: 'action', id: 'show-remaining', title: 'Show Remaining Tasks' },
        ],
      }
    },
    onAction: (id, { editor, row }) => {
      // These filters are scoped to the CLICKED row's subtree, which a
      // `filter` item query (pure render data) can't express — so compose
      // the query here with the row's (ensured) persistent id and set the
      // editor filter directly.
      const pid = row.ensuredPersistentId
      if (id === 'show-done') {
        editor.filter = `//@id = "${pid}"//@done`
      } else if (id === 'show-remaining') {
        editor.filter = `//@id = "${pid}"//not @done`
      }
    },
  })
}
