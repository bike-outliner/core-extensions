// The one stamp shape a completing `done` writes: the timestamp date wire
// form, which matches native Toggle Done by construction — the shared codec
// owns the encoding (a valid Date always encodes, hence the `!`). Everything
// in this bundle that marks rows done goes through here (progress.ts's
// mark-branch-done); calendar.bkext bundles separately and makes the same
// codec call itself (dom/Agenda.tsx).
export function doneStamp(): string {
  return bike.encodeValue('date', new Date(), { time: true })!
}

export function registerDone() {
  bike.attribute('done', {
    title: 'Done',
    type: 'date',
    emptyLabel: 'Done',
    description: 'Completion stamp — present means done; the value is the completion time, or empty for just "done".',
    // Done renders as the row's done styling — no default badge.
    defaultBadge: false,
    // The calendar shows every `date` attribute; done is a stamp of what
    // ALREADY happened, so every completed row would land on the calendar
    // on its completion day and drown the schedule in history. And the
    // context menu's attribute group lists every declared attribute; Toggle
    // Done (checkbox, Space, menu bar) already owns completing a row, so a
    // Done submenu of raw set/remove would just duplicate it, worse.
    metadata: { calendar: false, contextMenu: false },
  })
}
