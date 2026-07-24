import { dateSuggestions, parseDateAttribute } from './dates'

export function registerDone() {
  bike.attribute('done', {
    title: 'Done',
    type: 'date',
    emptyLabel: 'Done',
    description: 'Completion stamp — present means done; the value is the completion time, or empty for just "done".',
    // Done renders as the row's done styling — no default badge.
    defaultBadge: false,
    // ISO-8601 UTC without fractional seconds — the same stamp shape as
    // native Toggle Done (and progress.ts's mark-branch-done).
    shortcuts: () => [{ name: 'Done', value: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }],
    // A date OR empty: the same date vocabulary as due/start, with the
    // emptyLabel bare commit covering the valueless "just done" form.
    values: () => dateSuggestions(),
    parse: (text) => parseDateAttribute(text),
  })
}
