import { BadgeEnvironment, Image, SymbolConfiguration, Text } from 'bike/app'
import { isoDuration } from './helpers'

// The `clock` feature: time worked on a row, recorded as log entries.
//
// Independent of status and of tasks — you can clock any row, and clocking
// never changes its state. Time worked and state are different axes: you can
// work on something five times without its state changing once, which is why
// the clock records intervals rather than stamps.
//
// The commands (`clock:in`, `clock:out`) are native, because closing a clock
// has to happen inside the same transaction as a status change that closes
// the row.
//
// Everything you SEE, though, is here: a badge on each entry, and a Σ rollup
// on the rows above it. Both come in a static and a ticking variant, split on
// whether a clock is actually running — see the badges below.

export function registerClock() {
  bike.attribute('clock-duration', {
    title: 'Clocked',
    type: 'duration',
    description: 'Time a clock entry recorded. Present but empty means it is still running.',
    defaultBadge: false,
    metadata: { calendar: false, contextMenu: false, palette: false },
  })

  // Time worked below a row, folded from every clock entry in the branch —
  // the read side of `clock-duration`, and what makes clocking more than
  // prose: `duration(summary("clocked"))` against `@estimate` gives
  // actual-vs-planned. Same shape as estimate.ts's remaining summaries.
  //
  // A running entry's value is empty and contributes nothing, so this is
  // "time actually recorded". The live part is added at the badge, from the
  // two running summaries below.
  bike.summary('clocked', {
    where: '.@clock-duration',
    // The raw wire value — a duration-typed summary sums ISO durations
    // itself and emits one, so a read site unwraps with `duration(...)`.
    value: '@clock-duration',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant-or-self',
  })

  // The gate, descendants only: an entry row draws its own badge, so the Σ
  // should appear only where there is clocked time BELOW. With a typed
  // emission the two axes can't be derived from one another at a read site,
  // hence two summaries (the same split, for the same reason, as estimate.ts).
  bike.summary('clockedbelow', {
    where: '.@clock-duration',
    value: '@clock-duration',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant',
  })

  // Running clocks below a row: how many, and the sum of the instants they
  // started at. Elapsed time for N of them is `N * now() - Σstarts` — exact
  // even with several rows clocked at once, and it needs no clock reading in
  // the fold itself, which is the point: a summary's `where`/`value` must be a
  // pure function of its row, so `now()` is REJECTED there (SummaryValidation)
  // while `date()` is allowed. The wall clock enters at the badge instead.
  //
  // `clockstarted` is deliberately untyped: `date` can't be sum-reduced, and an
  // untyped sum reports a plain number, which is exactly what the arithmetic
  // wants.
  bike.summary('clockrunning', {
    where: '.@clock-duration = ""',
    reduce: 'count',
    axis: 'descendant',
  })
  bike.summary('clockstarted', {
    where: '.@clock-duration = ""',
    value: 'date(@log-date)',
    reduce: 'sum',
    axis: 'descendant',
  })

  // A finished entry: "1h 28m" under a clock face. The entry's own text
  // already says "Worked 1h 28m" in prose; the badge is what a filtered or
  // folded view can still read at a glance.
  bike.badge('clock', {
    where: '.@clock-duration and not @clock-duration = ""',
    inputs: { duration: '@clock-duration' },
    render: (values, env) => {
      const raw = values['duration']
      if (raw == null || raw === '') return null
      return clockBadge(env, env.formatAttribute('clock-duration', raw))
    },
  })

  // The same badge for a RUNNING entry, counting up from `log-date`.
  //
  // Split from the badge above rather than folded into it because `tick` is a
  // fixed property of a badge: every visible row carrying a ticking badge is
  // re-styled once a second. Split, a finished entry costs nothing and only a
  // live one ticks.
  bike.badge('clockRunning', {
    where: '.@clock-duration = ""',
    tick: 1,
    // `now()` and `date()` share an epoch, so this subtraction is seconds.
    // (`env.now` does NOT — it counts from 1970 — so live time is computed
    // here, in the path, never against `env.now` in the render.)
    inputs: { elapsed: 'now() - date(@log-date)' },
    render: (values, env) =>
      clockBadge(env, env.formatValue('duration', isoDuration(Number(values['elapsed'] ?? '0')))),
  })

  // The rollup: "Σ1h 32m" on any row with clocked time below it. The label is
  // the BRANCH total — the row's own entry time folded in with its
  // descendants' — while the gate is descendants-only, so an entry shows just
  // its own badge. Suppressed on the `Log` container itself, which would
  // otherwise repeat its parent's total verbatim one line down.
  //
  // No done-fade: like every subtree rollup it presents the branch below, not
  // the row's own state. Time worked doesn't stop counting once you finish.
  bike.badge('clockTotal', {
    where: '.duration(summary("clockedbelow")) > 0 and summary("clockrunning") = 0 and not @type = log',
    inputs: { total: 'summary("clocked")' },
    render: (values, env) => {
      const total = values['total']
      if (total == null) return null
      return clockBadge(env, `Σ${env.formatValue('duration', total)}`)
    },
  })

  // The rollup while a clock runs below: recorded time plus live elapsed, so
  // the total a row shows is the total right now. Gated on there being a
  // running clock, which is also what makes `clockTotal` above stand down —
  // the two are mutually exclusive, and only this one ticks.
  bike.badge('clockTotalRunning', {
    where: '.summary("clockrunning") > 0 and not @type = log',
    tick: 1,
    // `duration(...)` is mandatory, not stylistic: a duration-typed summary
    // emits an ISO string, and a raw ISO string in arithmetic coerces to NaN
    // and SILENTLY produces nothing.
    inputs: {
      seconds: 'duration(summary("clocked")) + summary("clockrunning") * now() - summary("clockstarted")',
    },
    render: (values, env) =>
      clockBadge(env, `Σ${env.formatValue('duration', isoDuration(Number(values['seconds'] ?? '0')))}`),
  })
}

// The shared recipe: a clock face stacked ahead of the label, both inside the
// estimate/due tag box. `badgeMetrics` carries every proportion, so all four
// badges match the rest of the row's tags at any text size.
function clockBadge(env: BadgeEnvironment, label: string): Image {
  const bm = env.badgeMetrics
  const color = env.color.alphaSet(0.8)
  const font = env.font.withPointSize(bm.fontSize)
  const symbol = Image.fromSymbol(
    new SymbolConfiguration('clock').withHierarchicalColor(color).withFont(font)
  )
  return symbol
    .withHStack(Image.fromText(new Text(label, font, color)), bm.strokeWidth * 2)
    .withBackground({
      stroke: env.color.alphaSet(0.3),
      strokeWidth: bm.strokeWidth,
      cornerRadius: bm.cornerRadius,
      padding: bm.padding,
    })
}
