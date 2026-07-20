import { AppExtensionContext, CommandContext, Image, MenuItem, Text } from 'bike/app'

// The "priority" feature: four commands (Priority 1/2/3 and Clear) that set or
// remove the `priority` attribute on the selected rows, plus a value-aware row
// badge. Clicking the badge shows a menu built from `command:<id>` buttons, so
// each menu row dispatches the same command — with the clicked row as its
// selection — that the command palette and keybindings use. The behavior lives
// in the commands; the menu just points at them.

export async function activate(context: AppExtensionContext) {
  bike.commands.addCommands({
    commands: {
      'priority:1': setPriority('1'),
      'priority:2': setPriority('2'),
      'priority:3': setPriority('3'),
      'priority:clear': clearPriority,
    },
  })

  // `where` selects rows with a `priority` attribute; `inputs` defaults to
  // ['priority'], so render reads values.priority (the memo key).
  bike.badge('priority', {
    where: '.@priority',
    render: (values, env) => {
      const n = clampPriority(values['priority'] ?? '')
      // A drawn number tag on the full badge-metrics recipe (fontSize +
      // padding size the tag, stroke/radius draw its border) — the same
      // recipe as the due badge's tag, so the two read as one family.
      const bm = env.badgeMetrics
      return Image.fromText(new Text('P' + n, env.font.withPointSize(bm.fontSize), env.color.alphaSet(0.8)))
        .withBackground({
          stroke: env.color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    onClick: ({ editor, row }) => {
      // Radio group from checked command buttons: the active priority carries
      // the checkmark, picking one dispatches its command and closes the
      // menu. "Show Priority" at the top filters to prioritized rows.
      editor.showMenu(row, {
        items: () => {
          const value = row.getAttribute('priority') ?? ''
          return [
            { type: 'button', id: 'filter', title: 'Show Priority', symbol: 'line.3.horizontal.decrease' },
            { type: 'separator' },
            ...([1, 2, 3] as const).map(
              (n): MenuItem => ({
                type: 'button',
                id: `command:priority:${n}`,
                title: `Priority ${n}`,
                state: value === String(n) ? 'on' : 'off',
              })
            ),
            { type: 'separator' },
            { type: 'button', id: 'command:priority:clear', title: 'Clear Priority' },
          ]
        },
        anchor: 'priority',
        onAction: (id, _value, { editor }) => {
          if (id !== 'filter') return
          editor.filter = { path: `//@priority`, label: `Show Priority` }
        },
      })
    },
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

function clampPriority(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(3, Math.max(1, n))
}
