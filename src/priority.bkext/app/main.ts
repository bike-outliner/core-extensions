import { AppExtensionContext, CommandContext, Image, SymbolConfiguration } from 'bike/app'

// The "priority" feature: four commands (Priority 1/2/3 and Clear) that set or
// remove the `priority` attribute on the selected rows, plus a value-aware row
// badge. The badge's click card is built from `kind: 'command'` items, so each
// card row dispatches the same command — with the clicked row as its selection —
// that the command palette and keybindings use. The behavior lives in the
// commands; the card just points at them.

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
      const value = values['priority'] ?? ''
      const n = clampPriority(value)
      return {
        image: Image.fromSymbol(
          new SymbolConfiguration(`${n}.square`).withHierarchicalColor(env.color.alphaSet(0.6)).withFont(env.font)
        ),
        items: [
          { kind: 'command', command: 'priority:1', title: 'Priority 1', state: value === '1' ? 'on' : 'off', filter: '//@priority = 1' },
          { kind: 'command', command: 'priority:2', title: 'Priority 2', state: value === '2' ? 'on' : 'off', filter: '//@priority = 2' },
          { kind: 'command', command: 'priority:3', title: 'Priority 3', state: value === '3' ? 'on' : 'off', filter: '//@priority = 3' },
          { kind: 'separator' },
          { kind: 'command', command: 'priority:clear', title: 'Clear Priority' },
        ],
      }
    },
  })
}

// Set `priority` to a fixed value on every selected row, in one undo step.
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

// Remove `priority` from every selected row.
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
