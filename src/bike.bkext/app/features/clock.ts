import { BadgeEnvironment, Color, Image, OutlineEditor, Row, SymbolConfiguration, Text } from 'bike/app'
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
// whether a clock is actually running — see the badges below. All four are
// clickable, and offer those two native commands for the row the badge speaks
// for.
//
// HELD BACK from the 2.0 release: nothing below the attribute declaration is
// registered, so the clock has no badges, no rollups, and no menu. The model,
// the native commands, and the attribute CLAIM all stay — see `CLOCK_BADGES`.

// Whether the clock draws. Off until the feature ships.
//
// The declaration above the gate is not optional: `defaultBadge: false` is what
// claims `clock-duration` from the catch-all badge (default-badge.ts), and
// `user: false` is what keeps it out of the `@` palette. Stop declaring it and
// documents that already hold clock entries get WORSE, not quieter — raw
// `clock-duration:PT1H0M0S` chips and an offered attribute. So the gate sits
// after the claim, not around it.
//
// Annotated `: boolean` on purpose: a bare `= false` narrows to the literal
// type, and TypeScript then reports the whole rest of the function as
// unreachable.
const CLOCK_BADGES: boolean = false

export function registerClock() {
  bike.attribute('clock-duration', {
    title: 'Clocked',
    type: 'duration',
    description: 'Time a clock entry recorded. Present but empty means it is still running.',
    defaultBadge: false,
    // The clock's own bookkeeping, not something to type onto a row — see
    // `log-date` in log.ts for what `user: false` means.
    metadata: { calendar: false, user: false },
  })

  if (!CLOCK_BADGES) return

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

  // A finished entry: a stopwatch and "1h 28m". The entry's text names the
  // event ("Clocked out") and never the length, so this chip is the only place
  // the duration is stated — and being a chip, it re-reads the attribute
  // rather than freezing a number into prose.
  //
  // Named `logInterval*` rather than `clock*` so the log's date chip sorts
  // ahead of it: badges have no order of their own and ties break
  // alphabetically on the decoration name, so `clock` would have put the
  // duration before the date on an entry while status entries read date-first.
  // The rollups below keep their `clock*` names — they sit on ordinary rows,
  // where nothing competes with them.
  bike.badge('logInterval', {
    where: '.@clock-duration and not @clock-duration = ""',
    inputs: { duration: '@clock-duration' },
    render: (values, env) => {
      const raw = values['duration']
      if (raw == null || raw === '') return null
      return clockBadge(env, env.formatAttribute('clock-duration', raw))
    },
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'logInterval'),
  })

  // The same badge for a RUNNING entry, counting up from `log-date`.
  //
  // Split from the badge above rather than folded into it because `tick` is a
  // fixed property of a badge: every visible row carrying a ticking badge is
  // re-styled once a second. Split, a finished entry costs nothing and only a
  // live one ticks.
  bike.badge('logIntervalRunning', {
    where: '.@clock-duration = ""',
    tick: 1,
    // `now()` and `date()` share an epoch, so this subtraction is seconds.
    // (`env.now` does NOT — it counts from 1970 — so live time is computed
    // here, in the path, never against `env.now` in the render.)
    inputs: { elapsed: 'now() - date(@log-date)' },
    render: (values, env) =>
      clockBadge(env, env.formatValue('duration', isoDuration(Number(values['elapsed'] ?? '0'))), true),
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'logIntervalRunning'),
  })

  // The rollup: a stopwatch and "Σ1h 32m" on any row with clocked time below
  // it. The label is the BRANCH total — the row's own entry time folded in
  // with its descendants' — while the gate is descendants-only, so an entry
  // shows just its own badge. Suppressed on the `Log` container itself, which
  // would otherwise repeat its parent's total verbatim one line down.
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
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'clockTotal'),
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
      clockBadge(env, `Σ${env.formatValue('duration', isoDuration(Number(values['seconds'] ?? '0')))}`, true),
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'clockTotalRunning'),
  })
}

// The shared recipe: a stopwatch stacked ahead of the label, both inside the
// estimate/due tag box. A stopwatch rather than a clock face because that is
// what this measures — an interval you started and will stop, not a time of
// day. `badgeMetrics` carries every proportion, so all four badges match the
// rest of the row's tags at any text size.
//
// `running` tints the whole badge — glyph, label and border — system green.
// Green means the number is LIVE: it is climbing while you read it. That is
// exactly the pair of badges that ticks, so the color and the second-by-second
// repaint always agree, and a document with a clock left running says so from
// across the outline.
function clockBadge(env: BadgeEnvironment, label: string, running = false): Image {
  const bm = env.badgeMetrics
  const font = env.font.withPointSize(bm.fontSize)
  const base = running ? Color.systemGreen() : env.color
  const color = base.alphaSet(0.8)
  const symbol = Image.fromSymbol(
    new SymbolConfiguration('stopwatch').withHierarchicalColor(color).withFont(font)
  )
  return symbol
    .withHStack(Image.fromText(new Text(label, font, color)), bm.strokeWidth * 2)
    .withBackground({
      stroke: base.alphaSet(0.3),
      strokeWidth: bm.strokeWidth,
      cornerRadius: bm.cornerRadius,
      padding: bm.padding,
    })
}

// The clock badges' menu: Clock In and Clock Out on the row the clicked badge
// speaks for, each enabled only when it would do something.
//
// The two commands are native and act on the SELECTION, and a badge click does
// NOT move the selection — the host swallows it so the caret stays put under
// the badge. So this selects the target first: that's what aims the commands,
// and it also shows you which row is about to be clocked before you choose.
function showClockMenu(editor: OutlineEditor, row: Row, badge: string): void {
  const target = clockTarget(row)
  const running = hasRunningClock(target)
  editor.selectRows(target)
  editor.showMenu(
    { row, anchor: badge },
    {
      items: [
        // `clock:.in`, not `clock:in` — hidden ids while the feature is held
        // back. This menu is unreachable today (nothing registers the badges
        // that open it); the ids are kept in step so it works when it returns.
        { type: 'button', id: 'command:clock:.in', title: 'Clock In', enabled: !running },
        { type: 'button', id: 'command:clock:.out', title: 'Clock Out', enabled: running },
      ],
    }
  )
}

// The row a clicked badge speaks for. The entry badges sit on a log entry, but
// an entry isn't what you clock — the row that KEEPS the log is, and the
// container sits between them, so it's the grandparent. Every other clock badge
// is a rollup on a row that speaks for itself.
function clockTarget(row: Row): Row {
  const container = row.parent
  return container?.type === 'log' ? container.parent ?? row : row
}

// Whether an interval is open on this row: an entry in its OWN log whose
// `clock-duration` is present but empty.
//
// Not `summary("clockrunning")`, which folds the whole branch: a row with a
// clocked CHILD is not itself clocked, and offering it Clock Out would stop
// nothing while hiding the Clock In it can actually do.
function hasRunningClock(row: Row): boolean {
  return row.children.some(
    (child) =>
      child.type === 'log' &&
      child.children.some((entry) => entry.getAttribute('clock-duration') === '')
  )
}
