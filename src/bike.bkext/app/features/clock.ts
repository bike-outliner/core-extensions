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

export function registerClock() {
  bike.attribute('log-clock-duration', {
    title: 'Logged Duration',
    type: 'duration',
    description: 'Time a clock entry recorded. Present but empty means it is still running.',
    defaultBadge: false,
    metadata: { calendar: false, contextMenu: false, palette: false },
  })

  // Time worked below a row, folded from every clock entry in the branch —
  // the read side of `log-clock-duration`, and what makes clocking more than
  // prose: `duration(summary("clocked"))` against `@estimate` gives
  // actual-vs-planned. Same shape as estimate.ts's remaining summaries.
  //
  // A running entry's value is empty and contributes nothing, so this is
  // "time actually recorded", not an estimate of work in flight.
  bike.summary('clocked', {
    where: '.@log-clock-duration',
    // The raw wire value — a duration-typed summary sums ISO durations
    // itself and emits one, so a read site unwraps with `duration(...)`.
    value: '@log-clock-duration',
    reduce: 'sum',
    type: 'duration',
    axis: 'descendant-or-self',
  })
}
