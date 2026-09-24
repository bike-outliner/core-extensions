import { Image, Text } from 'bike/app'
import { clearAttributeOnSelection, filterCommand, setAttributeOnSelection } from './helpers'

// The `priority` feature: a 1/2/3 choice attribute, a "P1" badge and commands.

export function registerPriority() {
  bike.attribute('priority', {
    title: 'Priority',
    // A `choice`, not a number: nothing sums or orders these.
    type: 'choice',
    choices: [
      { name: '1', value: '1' },
      { name: '2', value: '2' },
      { name: '3', value: '3' },
    ],
    description: 'Importance from 1 (highest) to 3 (lowest).',
    defaultBadge: false,
  })

  bike.commands.addCommands({
    commands: {
      'priority:1': setAttributeOnSelection('priority', '1', 'Set Priority'),
      'priority:2': setAttributeOnSelection('priority', '2', 'Set Priority'),
      'priority:3': setAttributeOnSelection('priority', '3', 'Set Priority'),
      'priority:clear': clearAttributeOnSelection('priority', 'Clear Priority'),
      'priority:filter': filterCommand({
        path: '//(@priority and open())',
        label: 'Priority',
        emptyTitle: 'No Prioritized Items',
        emptyMessage: 'There are no prioritized items that have not been completed.',
      }),
    },
  })

  bike.badge('priority', {
    where: '.@priority',
    inputs: { priority: '@priority', closed: 'closed()' },
    render: (values, env) => {
      const done = values['closed'] === 'true'
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
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'priority' }, 'priority'),
  })
}

// "P" plus the value clamped to 1–3, or bare "P" when there's no number.
function priorityLabel(value: string): string {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 'P'
  return 'P' + Math.min(3, Math.max(1, n))
}
