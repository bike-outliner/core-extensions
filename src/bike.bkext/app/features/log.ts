// The `log` feature: a row's history.
//
// A `Log` container child holds entries as ordinary rows. The container is
// the whole of what `type=log` means — entries are untyped rows carrying
// `log-*` attributes by convention, which is what lets any feature record
// into one shared history and lets a user write an entry by hand.
//
// This file owns only `log-date`, the one field every entry carries. Each
// feature declares the `log-*` attributes IT writes: `log-status` lives with
// status, `log-clock-duration` with the clock. That way a feature and its
// vocabulary arrive and leave together.
//
// Row-generic, like status and the clock: any row can keep a log. The
// commands (`log:enable`, `log:disable`) are native, because creating the
// container and folding it away is editor work.

export function registerLog() {
  bike.attribute('log-date', {
    title: 'Logged Date',
    type: 'date',
    description: 'When a log entry happened. Present on every entry.',
    defaultBadge: false,
    // History is not schedule: on the calendar every completed row would
    // land on its completion day and drown the actual plan. And the
    // @-palette never offers it — it means nothing typed onto a row outside
    // a log (rows already carrying it still list).
    metadata: { calendar: false, contextMenu: false, palette: false },
  })
}
