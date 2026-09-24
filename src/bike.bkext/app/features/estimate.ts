import { Image, Text } from 'bike/app'
import { clearAttributeOnSelection, filterCommand, pickAttributeForSelection } from './helpers'

// The `estimate` feature: a "≈1h 30m" badge, a "Σ1h 30m" remaining-work
// rollup, and commands. No direct-value setters; durations have no canonical set.

export function registerEstimate() {
  bike.attribute('estimate', {
    title: 'Estimate',
    type: 'duration',
    description: 'Estimated effort as a duration: 30m, 2h, 1d.',
    defaultBadge: false,
    // Day-scale at most; the picker shows only these.
    components: ['days', 'hours', 'minutes'],
  })

  bike.commands.addCommands({
    commands: {
      'estimate:set': pickAttributeForSelection('estimate'),
      'estimate:clear': clearAttributeOnSelection('estimate', 'Clear Estimate'),
      'estimate:filter': filterCommand({
        path: '//(@estimate and open())',
        label: 'Estimated',
        emptyTitle: 'No Estimated Items',
        emptyMessage: 'There are no estimated items that have not been completed.',
      }),
    },
  })

  // Duration-typed, emitting ISO. Numeric read sites need `duration()`: a raw
  // ISO string in a comparison is silently NaN. Two axes: the value includes
  // self, the gate is descendants only; typed emissions can't derive one from
  // the other.
  bike.summary('remainingestimate', {
    where: '.@estimate and open()',
    value: '@estimate',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant-or-self',
  })
  bike.summary('remainingbelow', {
    where: '.@estimate and open()',
    value: '@estimate',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant',
  })

  bike.badge('estimate', {
    where: '.@estimate',
    inputs: { estimate: '@estimate', closed: 'closed()' },
    render: (values, env) => {
      const raw = values['estimate']
      if (raw == null || raw === '') return null
      const done = values['closed'] === 'true'
      const bm = env.badgeMetrics
      const label = `≈${env.formatAttribute('estimate', raw)}`
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(done ? 0.3 : 0.8)))
        .withBackground({
          stroke: env.color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'estimate' }, 'estimate'),
  })

  // Branch total of open estimates, shown only when there's work below.
  bike.badge('estimateRemaining', {
    where: '.duration(summary("remainingbelow")) > 0',
    inputs: {
      remaining: 'summary("remainingestimate")',
      belowSeconds: 'duration(summary("remainingbelow"))',
    },
    render: (values, env) => {
      const remaining = values['remaining']
      const belowSeconds = Number(values['belowSeconds'] ?? '0')
      if (remaining == null || !(belowSeconds > 0)) return null
      const bm = env.badgeMetrics
      const label = `Σ${env.formatValue('duration', remaining)}`
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(0.8)))
        .withBackground({
          stroke: env.color.alphaSet(0.3),
          strokeWidth: bm.strokeWidth,
          cornerRadius: bm.cornerRadius,
          padding: bm.padding,
        })
    },
  })
}
