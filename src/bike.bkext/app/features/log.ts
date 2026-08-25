import { Image } from 'bike/app'
import { attributeTag } from './helpers'

// The `log` feature: a row's history.
//
// A `Log` container child holds entries as ordinary rows. The container is
// the whole of what `type=log` means — entries are untyped rows carrying
// `log-*` attributes by convention, which is what lets any feature record
// into one shared history and lets a user write an entry by hand.
//
// This file owns only `log-date`, the one field every entry carries. Each
// feature declares the `log-*` attributes IT writes: `log-status` lives with
// status, `clock-duration` with the clock. That way a feature and its
// vocabulary arrive and leave together.
//
// ONE SHAPE FOR EVERY ENTRY, whichever feature writes it: the row's TEXT names
// the event and carries no values ("Status changed", "Clocked in"), `log-date`
// says when and is badged HERE so no feature has to, and the feature's own
// `log-*` field is badged beside it as its own chip.
//
// That is what makes an entry an ordinary row — text you can click into and
// annotate, with the record in small chips next to it. It replaces an earlier
// rule where `log-date` drew nothing on its own and each feature spelled out
// date-and-field together; that produced one long tag on a textless row, which
// is not a shape Bike teaches anywhere else.
//
// Row-generic, like status and the clock: any row can keep a log. The one
// command is native, because creating the container and folding it away is
// editor work — and it is `row:create-log`, not a `log:` namespace of its
// own, because creating a child row is what it does. There is no delete
// command to pair with it: opting out means deleting the container, which
// deletes the history with it, so it is left as a deletion you make yourself
// rather than a menu item.

export function registerLog() {
  bike.attribute('log-date', {
    title: 'Logged Date',
    type: 'date',
    description: 'When a log entry happened. Present on every entry.',
    // Claimed by the `logDate` badge below rather than left to the catch-all,
    // which would draw it as `log-date:…` — the field name is noise on a row
    // whose whole job is to be an entry.
    defaultBadge: false,
    // History is not schedule: on the calendar every completed row would
    // land on its completion day and drown the actual plan. And the
    // Attributes Editor never offers it — it means nothing typed onto a row outside
    // a log (rows already carrying it still list).
    // `user: false`: never OFFERED on a row that lacks it. This is the
    // log's own bookkeeping — it means nothing typed onto an ordinary row,
    // and a stray hand-typed `log-date` would look like a record and not be
    // one. An entry that carries it still shows and edits it normally.
    metadata: { calendar: false, user: false },
  })

  // THE ENTRY, drawn whole: the date, then whatever was recorded.
  //
  // ONE badge for every field, rather than one badge per feature. It reads the
  // row's whole attribute map and picks out `log-*` at render time, because a
  // badge's `where` cannot say "any attribute starting with log-" — OutlinePath
  // matches attribute names exactly. That map is also what makes this generic:
  // any attribute the user keeps history for gets its value presented here
  // without registering anything, and an extension's own attribute — or one no
  // extension declared — is presented on the same terms as a built-in.
  //
  // Chips come back as an ARRAY, and array order is display order, so the date
  // always leads and the values follow in a stable order. That is stronger than
  // what separate badges could promise: badges carry no order of their own and
  // tie-break alphabetically on name.
  //
  // Each value formats through its BASE attribute's definition —
  // `formatAttribute('priority', …)` for a `log-priority` value — so a recorded
  // value reads exactly as the live one does, and `log-*` twins never need
  // declaring just to be displayable.
  bike.badge('logEntry', {
    where: '.@log-date',
    inputs: 'rowAttributes',
    // The date label is now-relative ("Today", then "Yesterday" tomorrow), so
    // it goes stale at midnight without a tick.
    tick: 60,
    render: (values, env) => {
      const chips: { key: string; image: Image }[] = []

      const date = values['log-date']
      if (date != null && date !== '') {
        chips.push({ key: 'log-date', image: attributeTag(env, env.formatAttribute('log-date', date)) })
      }

      // Sorted so an entry that somehow carries two recorded fields draws
      // them the same way every time.
      const fields = Object.keys(values)
        .filter((name) => name.startsWith('log-') && name !== 'log-date')
        .sort()

      for (const field of fields) {
        const value = values[field] ?? ''
        // Formatted as its own attribute would be. A recorded value whose
        // attribute is no longer installed still shows its raw value rather
        // than vanishing — half a record beats none.
        const label = env.formatAttribute(field.slice('log-'.length), value)
        if (label === '') continue
        chips.push({ key: field, image: attributeTag(env, label) })
      }

      return chips.length > 0 ? chips : null
    },
    // Correcting a record is an ordinary attribute edit on the field that was
    // clicked: an entry is data, and nothing re-derives it. Only a field with
    // a declared twin gets a type-aware menu; the rest get the generic one,
    // which is the honest result of not declaring it.
    onClick: ({ editor, row, key }) => {
      if (key) editor.showAttributeMenu({ row, anchor: { badge: 'logEntry', key } }, key)
    },
  })
}
