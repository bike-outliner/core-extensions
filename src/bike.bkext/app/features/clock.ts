import { BadgeEnvironment, Color, Image, OutlineEditor, Row, SymbolConfiguration, Text } from 'bike/app'
import { isoDuration } from './helpers'

// The `clock` feature: time worked on a row, recorded as log entry intervals.
// Independent of status. The commands (`clock:in`, `clock:out`) are native so
// closing a clock shares the transaction of a status change that closes the row.
//
// Held back from 2.0: nothing below the attribute declaration is registered.

// Off until the feature ships. The attribute declaration must stay above the
// gate: it claims `clock-duration` from the catch-all badge and hides it from
// the Attributes Editor. `: boolean` stops TS narrowing and flagging unreachable code.
const CLOCK_BADGES: boolean = false

export function registerClock() {
  bike.attribute('clock-duration', {
    title: 'Clocked',
    type: 'duration',
    description: 'Time a clock entry recorded. Present but empty means it is still running.',
    defaultBadge: false,
    // Bookkeeping, see `log-date` in log.ts for `user: false`.
    metadata: { calendar: false, user: false },
  })

  if (!CLOCK_BADGES) return

  // Recorded time in the branch; running entries are empty and add nothing
  // (the badge adds live time).
  bike.summary('clocked', {
    where: '.@clock-duration',
    // Emits an ISO duration; read sites unwrap with `duration(...)`.
    value: '@clock-duration',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant-or-self',
  })

  // Descendants-only gate; typed emissions can't derive one axis from the other.
  bike.summary('clockedbelow', {
    where: '.@clock-duration',
    value: '@clock-duration',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant',
  })

  // Elapsed for N running clocks is `N * now() - Σstarts`; `now()` is rejected
  // in summaries, so it enters at the badge. `clockstarted` is untyped because
  // `date` can't be sum-reduced.
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

  // Named `logInterval*` so it sorts after the log's date badge (ties break
  // alphabetically by name).
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

  // Separate badge so only running entries tick.
  bike.badge('logIntervalRunning', {
    where: '.@clock-duration = ""',
    tick: 1,
    // `now()` and `date()` share an epoch; `env.now` (1970) does not.
    inputs: { elapsed: 'now() - date(@log-date)' },
    render: (values, env) =>
      clockBadge(env, env.formatValue('duration', isoDuration(Number(values['elapsed'] ?? '0'))), true),
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'logIntervalRunning'),
  })

  // Branch total, gated on time below; skipped on the Log container, which
  // would repeat its parent's total.
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

  // Recorded plus live time; mutually exclusive with `clockTotal`.
  bike.badge('clockTotalRunning', {
    where: '.summary("clockrunning") > 0 and not @type = log',
    tick: 1,
    // `duration(...)` is required: a raw ISO string in arithmetic is silently NaN.
    inputs: {
      seconds: 'duration(summary("clocked")) + summary("clockrunning") * now() - summary("clockstarted")',
    },
    render: (values, env) =>
      clockBadge(env, `Σ${env.formatValue('duration', isoDuration(Number(values['seconds'] ?? '0')))}`, true),
    onClick: ({ editor, row }) => showClockMenu(editor, row, 'clockTotalRunning'),
  })
}

// `running` tints the badge green, matching the badges that tick.
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

// The native commands act on the selection, which a badge click doesn't move,
// so select the target first.
function showClockMenu(editor: OutlineEditor, row: Row, badge: string): void {
  const target = clockTarget(row)
  const running = hasRunningClock(target)
  editor.selectRows(target)
  editor.showMenu(
    { row, anchor: badge },
    {
      items: [
        // Hidden `clock:.` ids while the feature is held back.
        { type: 'button', id: 'command:clock:.in', title: 'Clock In', enabled: !running },
        { type: 'button', id: 'command:clock:.out', title: 'Clock Out', enabled: running },
      ],
    }
  )
}

// For a log entry, the row that keeps the log (its grandparent).
function clockTarget(row: Row): Row {
  const container = row.parent
  return container?.type === 'log' ? container.parent ?? row : row
}

// Checks only the row's own log; `summary("clockrunning")` covers the whole branch.
function hasRunningClock(row: Row): boolean {
  return row.children.some(
    (child) =>
      child.type === 'log' &&
      child.children.some((entry) => entry.getAttribute('clock-duration') === '')
  )
}
