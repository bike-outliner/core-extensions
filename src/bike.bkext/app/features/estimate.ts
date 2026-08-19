import { Image, Text } from 'bike/app'
import { clearAttributeOnSelection, filterCommand, pickAttributeForSelection } from './helpers'

// The `estimate` feature: how much effort a row is expected to take, a badge
// drawing it as "≈1h 30m", a "Σ1h 30m" badge summing the remaining (not-done)
// estimates in the subtree below, and three commands.
//
// A duration has no small closed set of interesting values the way priority
// and flagged do — "2h" isn't more canonical than "90m" — so there are no
// direct-value setters here, just the picker.

export function registerEstimate() {
  bike.attribute('estimate', {
    title: 'Estimate',
    type: 'duration',
    description: 'Estimated effort as a duration: 30m, 2h, 1d.',
    defaultBadge: false,
    // Recorded in the log — re-estimating is worth a record on long work.
    metadata: { log: true },
    // Estimates are day-scale at most — the picker's segment editor shows
    // only these.
    components: ['days', 'hours', 'minutes'],
  })

  bike.commands.addCommands({
    commands: {
      // The picker's segment editor shows the day/hour/minute fields the
      // `components` facet above declares.
      'estimate:set': pickAttributeForSelection('estimate'),
      'estimate:clear': clearAttributeOnSelection('estimate', 'Clear Estimate'),
      // Estimated work still to do — the same not-done split the remaining
      // summaries below make.
      'estimate:filter': filterCommand({
        path: '//(@estimate and open())',
        label: 'Estimated',
        emptyTitle: 'No Estimated Items',
        emptyMessage: 'There are no estimated items that have not been completed.',
      }),
    },
  })

  // The remaining-estimate summaries, duration-TYPED: not-done estimates
  // summed in the native duration encoding and re-emitted as wire ISO
  // ("PT1H30M") — so the native, localizable formatter displays it directly,
  // and any query or extension reads a well-formed duration. The price sits
  // at numeric read sites: a raw ISO string in a comparison coerces to NaN
  // and SILENTLY never matches, so the `> 0` gate needs an explicit
  // `duration()` wrapper (see the remaining badge below).
  //
  // Two axes for two jobs. The VALUE the Σ badge shows is the whole
  // branch's remaining work including the row's own open estimate
  // (`descendant-or-self`). The GATE is descendants only: a leaf's own
  // estimate already has its ≈ badge, so the Σ appears only when there's
  // work *below* — and with typed emission the two can't be derived from
  // one another at a read site, hence two summaries.
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
      // A valueless @estimate estimates nothing — draw no badge at all
      // (estimate is claimed, so the catch-all won't render it either).
      if (raw == null || raw === '') return null
      const done = values['closed'] === 'true'
      // The catch-all badge's recipe exactly (../default-badge), with "≈"
      // standing in for its "estimate:" prefix — so an estimate reads as one
      // of the generic tags, just shorter. Completed rows fade the text down
      // to the border's alpha, matching the due badge — a done row's estimate
      // is spent, not pending (the remaining summary makes the same split).
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
    // The same click behavior the catch-all gave it before this badge
    // claimed the attribute.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'estimate' }, 'estimate'),
  })

  // The remaining badge: "Σ1h 30m" on any row with undone estimated work
  // below it. The label is the BRANCH total — the row's own open estimate
  // folded in with its descendants' — while the gate is descendants-only,
  // so a leaf shows just its ≈ badge. Coexists with the row's own ≈ badge —
  // the two answer different questions (this row's cost vs the branch's
  // remaining total). No done-fade: like every subtree rollup it presents
  // the branch below, not the row's own state, and it disappears on its own
  // once the branch completes.
  bike.badge('estimateRemaining', {
    where: '.duration(summary("remainingbelow")) > 0',
    // The ISO emission for the label, `duration()` seconds for the gate —
    // JS never parses ISO itself.
    inputs: {
      remaining: 'summary("remainingestimate")',
      belowSeconds: 'duration(summary("remainingbelow"))',
    },
    render: (values, env) => {
      const remaining = values['remaining']
      const belowSeconds = Number(values['belowSeconds'] ?? '0')
      if (remaining == null || !(belowSeconds > 0)) return null
      // The ≈ badge's recipe with "Σ" as the prefix — ISO straight through
      // the native duration formatter, localizable, no hand-rolled encoding.
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
