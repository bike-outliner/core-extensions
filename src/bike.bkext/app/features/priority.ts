import { CommandContext, Image, Text } from 'bike/app'

// The `priority` feature: a closed 1/2/3 attribute, a drawn "P1"/"P2"/"P3"
// badge, and four commands that set or clear it on the selected rows.
//
// The commands are the only way to ADD a priority from the keyboard or the
// command palette — the badge only appears on rows that already have one.

export function registerPriority() {
  bike.attribute('priority', {
    title: 'Priority',
    // A closed set of three — a `choice`, not a number: the values are
    // labels that happen to read as digits, and nothing sums or orders them.
    // The wire values are unchanged ('1'/'2'/'3').
    type: 'choice',
    choices: [
      { name: '1', value: '1' },
      { name: '2', value: '2' },
      { name: '3', value: '3' },
    ],
    description: 'Importance from 1 (highest) to 3 (lowest).',
    // The badge below presents this attribute — opt out of the catch-all.
    defaultBadge: false,
  })

  bike.commands.addCommands({
    commands: {
      'priority:1': setPriority('1'),
      'priority:2': setPriority('2'),
      'priority:3': setPriority('3'),
      'priority:clear': clearPriority,
    },
  })

  bike.badge('priority', {
    where: '.@priority',
    inputs: { priority: '@priority', done: '@done' },
    render: (values, env) => {
      const done = values['done'] != null
      // A drawn number tag on the full badge-metrics recipe (fontSize +
      // padding size the tag, stroke/radius draw its border) — the same
      // recipe as the due badge's tag, so the two read as one family.
      // Completed rows fade the text down to the border's alpha, the same
      // treatment the due badge gives its label — a done row's priority
      // is history.
      const bm = env.badgeMetrics
      const label = priorityLabel(values['priority'] ?? '')
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(done ? 0.3 : 0.8)))
        .withBackground({
          stroke: env.color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    // The built-in attribute menu, which derives its rows from the closed
    // choice: the three values as radios, plus filter and remove.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'priority' }, 'priority'),
  })
}

function setPriority(value: string) {
  return ({ editor, selection }: CommandContext): boolean => {
    const rows = selection?.rows ?? []
    if (!editor || rows.length === 0) return false
    editor.outline.transaction({ label: 'Set Priority' }, () => {
      for (const row of rows) row.setAttribute('priority', value)
    })
    return true
  }
}

function clearPriority({ editor, selection }: CommandContext): boolean {
  const rows = selection?.rows ?? []
  if (!editor || rows.length === 0) return false
  editor.outline.transaction({ label: 'Clear Priority' }, () => {
    for (const row of rows) row.removeAttribute('priority')
  })
  return true
}

// The tag's text: "P" plus the value clamped into the closed 1–3 set — or a
// bare "P" when the value carries no number at all (a valueless @priority
// marks the row as prioritized without inventing a rank for it).
function priorityLabel(value: string): string {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 'P'
  return 'P' + Math.min(3, Math.max(1, n))
}
