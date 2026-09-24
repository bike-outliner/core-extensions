import { Image } from 'bike/app'
import { attributeTag } from './helpers'

// The `log` feature: a row's history. A `type=log` container child holds
// entries as untyped rows carrying `log-*` attributes. An entry's text names
// the event; its values are drawn as badges. This file owns only `log-date`;
// each feature declares the `log-*` fields it writes. The one command,
// `row:create-log`, is native.

export function registerLog() {
  bike.attribute('log-date', {
    title: 'Logged Date',
    type: 'date',
    description: 'When a log entry happened. Present on every entry.',
    // Drawn by the `logEntry` badge below.
    defaultBadge: false,
    // History, not schedule. `user: false`: never offered on a row that lacks
    // it; rows that have it still show and edit it.
    metadata: { calendar: false, user: false },
  })

  // One badge for every `log-*` field: `where` can't match a name prefix, so it
  // reads the full map. Array order is display order, so the date leads. Values
  // format through their base attribute, so twins needn't be declared.
  bike.badge('logEntry', {
    where: '.@log-date',
    inputs: 'rowAttributes',
    // Date labels are now-relative and go stale at midnight.
    tick: 60,
    render: (values, env) => {
      const chips: { key: string; image: Image }[] = []

      const date = values['log-date']
      if (date != null && date !== '') {
        chips.push({ key: 'log-date', image: attributeTag(env, env.formatAttribute('log-date', date)) })
      }

      const fields = Object.keys(values)
        .filter((name) => name.startsWith('log-') && name !== 'log-date')
        .sort()

      for (const field of fields) {
        const value = values[field] ?? ''
        // An uninstalled attribute still shows its raw value.
        const label = env.formatAttribute(field.slice('log-'.length), value)
        if (label === '') continue
        chips.push({ key: field, image: attributeTag(env, label) })
      }

      return chips.length > 0 ? chips : null
    },
    // Only a field with a declared twin gets a type-aware menu.
    onClick: ({ editor, row, key }) => {
      if (key) editor.showAttributeMenu({ row, anchor: { badge: 'logEntry', key } }, key)
    },
  })
}
