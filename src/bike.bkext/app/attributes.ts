import { BadgeEnvironment, Disposable, Image, MenuItem, OutlineEditor, Row, Text } from 'bike/app'
import { addDays, dayKey, dateSuggestions, parseDateAttribute, parseDurationAttribute } from './dates'

// Attribute completion is native now: typing `@name` / `@name:value` at the
// END of a row's text completes and commits row attributes for ANY name (the
// editor's built-in provider). What lives here:
//
// - The DEFAULT ATTRIBUTE SET: the shapes (type, sigil, values, parsing) of
//   the attributes Bike treats as common vocabulary — done, due, priority,
//   status, start, estimate, flagged — registered centrally so every
//   extension sharing them reads the same `AttributeInfo` contract.
//   Presentation stays where it belongs: calendar.bkext renders the due
//   badge; done renders as row styling; the rest go through the catch-all.
// - The CATCH-ALL badge: ONE `bike.badge` whose match-any `where` and
//   `inputs: '*'` (the row's full attribute map) render a keyed badge per
//   attribute no extension presents (`defaultBadge: false` definitions are
//   claimed). The style system re-renders when a row's attributes change;
//   the only external state — the claims snapshot — is captured in the
//   render closure, and a claims change re-registers the badge. So
//   uninstalling e.g. a priority-badge extension hands `priority:2`
//   rendering to the catch-all with no timers, scans, or reconciliation.

const VALUE_TRUNCATE_LENGTH = 20

export function registerAttributes() {
  // Registration order sets the bare-`@` popup's quick-effect group order:
  // shortcut owners (done, due, priority) first.
  bike.attribute('done', {
    title: 'Done',
    type: 'date',
    emptyLabel: 'Done',
    description: 'Completion stamp — present means done; the value is the completion time.',
    // Done renders as the row's done styling — no catch-all badge.
    defaultBadge: false,
    // ISO-8601 UTC without fractional seconds — the same stamp shape as
    // native Toggle Done (and progress.ts's mark-branch-done).
    shortcuts: () => [{ name: 'Done', value: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }],
  })

  // The due SHAPE lives here so it's defined whether or not calendar.bkext
  // is enabled; calendar presents it (badge, commands, calendar inspector).
  bike.attribute('due', {
    title: 'Due',
    type: 'date',
    sigil: '^',
    emptyLabel: 'Soon',
    description: 'When the row is due — a calendar day, a timestamp, or valueless for "soon".',
    // calendar.bkext presents due itself — opt out of the catch-all badge.
    defaultBadge: false,
    shortcuts: () => {
      const now = new Date()
      return [
        { name: 'Due Today', value: dayKey(now) },
        { name: 'Due Tomorrow', value: dayKey(addDays(now, 1)) },
        { name: 'Due Soon', value: '' },
      ]
    },
    values: () => dateSuggestions(),
    parse: (text) => {
      // The valueless due: `@due:soon` and `^soon` commit the empty value.
      if (text.trim().toLowerCase() === 'soon') return { value: '', label: 'Soon' }
      return parseDateAttribute(text)
    },
  })

  bike.attribute('priority', {
    title: 'Priority',
    type: 'number',
    sigil: '!',
    strict: true,
    description: 'Importance from 1 (highest) to 3 (lowest).',
    standardValues: [1, 2, 3].map((n) => ({ name: String(n), value: String(n) })),
    shortcuts: () => [1, 2, 3].map((n) => ({ name: `Priority ${n}`, value: String(n) })),
  })

  bike.attribute('status', {
    title: 'Status',
    type: 'string',
    strict: true,
    description: 'Workflow state: todo, doing, or review.',
    standardValues: [
      { name: 'todo', value: 'todo' },
      { name: 'doing', value: 'doing' },
      { name: 'review', value: 'review' },
    ],
  })

  bike.attribute('start', {
    title: 'Start',
    type: 'date',
    description: 'When work on the row starts — same date shapes as due.',
    values: () => dateSuggestions(),
    parse: (text) => parseDateAttribute(text),
  })

  bike.attribute('estimate', {
    title: 'Estimate',
    type: 'duration',
    description: 'Estimated effort as a duration: 30m, 2h, 1d.',
    standardValues: ['15m', '30m', '1h', '2h', '1d'].map((d) => ({ name: d, value: d })),
    parse: (text) => parseDurationAttribute(text),
  })

  bike.attribute('flagged', {
    title: 'Flagged',
    type: 'flag',
    emptyLabel: 'Flagged',
    description: 'Marks the row for attention — valueless.',
  })

  registerCatchAllBadges()
}

/**
 * The badge-worthy attribute names of a row's attribute map: everything not
 * claimed by a `defaultBadge: false` definition, sorted. (`values` already
 * excludes the reserved names — `inputs: '*'` filters them natively.)
 * Pure — exported for tests.
 */
export function unclaimedNames(
  values: Readonly<Record<string, string | undefined>>,
  claimed: ReadonlySet<string>
): string[] {
  return Object.keys(values)
    .filter((name) => !claimed.has(name))
    .sort()
}

function registerCatchAllBadges() {
  let catchAll: Disposable | undefined

  // The claims + standard-values snapshot is the only state the badges
  // depend on beyond each row's own attributes. Capture it in the render
  // closure and re-register on every change — a fresh badge identity means
  // a fresh render cache, so claims changes repaint without any dirtying
  // protocol. Row-attribute changes re-render through the style system.
  bike.observeAttributes((infos) => {
    const claimed = new Set(infos.filter((info) => !info.defaultBadge).map((info) => info.name))
    standardValuesByName.clear()
    emptyLabelByName.clear()
    strictByName.clear()
    for (const info of infos) {
      if (info.standardValues.length > 0) standardValuesByName.set(info.name, info.standardValues)
      if (info.emptyLabel != null) emptyLabelByName.set(info.name, info.emptyLabel)
      if (info.strict) strictByName.add(info.name)
    }

    catchAll?.dispose()
    catchAll = bike.badge('attributes', {
      where: '.*',
      inputs: '*',
      render: (values, env) => {
        const names = unclaimedNames(values, claimed)
        if (names.length === 0) return null
        return names.map((name) => ({ key: name, image: badgeImage(name, values[name] ?? '', env) }))
      },
      onClick: ({ editor, row, key }) => {
        if (key != null) showBadgeMenu(editor, row, key)
      },
    })
  })
}

/**
 * A generic drawn tag for one attribute: the definition's emptyLabel (when
 * declared) or `name` when valueless, `name:value` otherwise (colon-tight,
 * matching the typed completion syntax) — the same badge-metrics recipe as
 * the due badge so all row tags read as one family.
 */
function badgeImage(name: string, value: string, env: BadgeEnvironment): Image {
  const label =
    value === '' ? (emptyLabelByName.get(name) ?? name) : `${name}:${truncate(value, VALUE_TRUNCATE_LENGTH)}`
  const bm = env.badgeMetrics
  return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(0.8))).withBackground({
    stroke: env.color.alphaSet(0.3),
    strokeWidth: bm.strokeWidth,
    cornerRadius: bm.cornerRadius,
    padding: bm.padding,
  })
}

/**
 * The badge menu: filter by the attribute (or its exact value), pick one of
 * its standard values (when the definition declares them), enter a custom
 * value (unless the definition is strict), or remove it. Items are re-read
 * from the row per open, so the value rows reflect the current value.
 */
function showBadgeMenu(editor: OutlineEditor, row: Row, name: string) {
  editor.showMenu(row, {
    items: () =>
      badgeMenuItems(name, row.getAttribute(name) ?? '', standardValuesByName.get(name) ?? [], strictByName.has(name)),
    anchor: { badge: 'attributes', key: name },
    onAction: (id, _value, { editor, row }) => {
      // A standard-value pick: radio semantics — set the value.
      if (id.startsWith('set:')) {
        const value = id.slice('set:'.length)
        editor.outline.transaction({ label: 'Set Attribute' }, () => {
          row.setAttribute(name, value)
        })
        return
      }
      switch (id) {
        case 'filter':
          applyFilter(editor, `//@${name}`, `@${name}`)
          break
        case 'filter-value': {
          // Read the CURRENT value at action time, not the render capture.
          const value = row.getAttribute(name) ?? ''
          applyFilter(editor, `//@${name} = ${JSON.stringify(value)}`, `@${name} = ${value}`)
          break
        }
        case 'edit':
          appendAttributeToken(editor, row, name)
          editor.showCompletions()
          break
        case 'remove':
          editor.outline.transaction({ label: 'Remove Attribute' }, () => {
            row.removeAttribute(name)
          })
          break
      }
    },
  })
}

/** The definition-declared standard values per attribute name, from the
 * `observeAttributes` snapshot — what the badge menu offers as pick rows. */
const standardValuesByName = new Map<string, { name: string; value: string }[]>()

/** The definition-declared empty-value labels ("Flagged"), from the same
 * snapshot — what a valueless badge renders instead of the raw name. */
const emptyLabelByName = new Map<string, string>()

/** The names whose definitions declare `strict` — their standard values are
 * the complete legal set, so the menu offers no custom-value entry. */
const strictByName = new Set<string>()

/** The badge menu's items — pure, exported for tests. */
export function badgeMenuItems(
  name: string,
  value: string,
  standardValues: { name: string; value: string }[] = [],
  strict = false
): MenuItem[] {
  const items: MenuItem[] = []
  items.push({ type: 'button', id: 'filter', title: `Filter @${name}` })
  if (value !== '') {
    items.push({
      type: 'button',
      id: 'filter-value',
      title: `Filter @${name} = ${truncate(value, VALUE_TRUNCATE_LENGTH)}`,
    })
  }
  items.push({ type: 'separator' })
  // Standard values, radio style: the current value carries the checkmark,
  // picking one sets it. Other Value reads as part of the same list — no
  // separator — and is omitted when the definition is strict.
  if (standardValues.length > 0) {
    for (const standard of standardValues) {
      items.push({
        type: 'button',
        id: `set:${standard.value}`,
        title: standard.name,
        state: standard.value === value ? 'on' : 'off',
      })
    }
  }
  if (!strict) {
    items.push({ type: 'button', id: 'edit', title: 'Other Value' })
  }
  items.push({ type: 'separator' })
  items.push({ type: 'button', id: 'remove', title: `Remove @${name}` })
  return items
}

/**
 * Stage the Edit completion flow: append ` @name:` to the end of the row's
 * text (boundary space only when needed — the token grammar requires it)
 * and put the caret at the end. Exported for tests; the caller follows with
 * `editor.showCompletions()`.
 */
export function appendAttributeToken(editor: OutlineEditor, row: Row, name: string) {
  const text = row.text.string
  const boundary = text.length > 0 && !/\s$/.test(text) ? ' ' : ''
  editor.transaction({ label: 'Edit Attribute' }, () => {
    row.text.append(`${boundary}@${name}:`)
    editor.selectText(row, row.text.count)
  })
}

/**
 * The filterDue commit shape: focus home so the filter covers the whole
 * outline, one transaction so the layer sees a single old→new event.
 */
function applyFilter(editor: OutlineEditor, path: string, label: string) {
  editor.transaction({ label: 'Filter Attribute', animate: { spring: 'navigation' } }, () => {
    editor.focus = editor.outline.root
    editor.filter = { path, label }
  })
}

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) + '…' : value
}
