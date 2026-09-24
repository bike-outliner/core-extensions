import { BadgeEnvironment, Disposable, Image, Text } from 'bike/app'
import {
  ATTRIBUTE_OVERRIDES_KEY,
  AttributeOverrides,
  LOG_FIELD_PREFIX,
  readOverrides,
} from '../dom/protocols'

// The catch-all badge: one keyed badge per attribute in the row's map that no
// extension claims (`defaultBadge: false`), including unregistered names.
// External state (claims, overrides) is captured in the render closure, and a
// change re-registers the badge. The user's Badge column setting beats the
// declaration in both directions.

const VALUE_TRUNCATE_LENGTH = 20

/** Sorted badge-worthy names: the user's Badge choice, else unclaimed. */
export function unclaimedNames(
  values: Readonly<Record<string, string | undefined>>,
  claimed: ReadonlySet<string>,
  overrides: AttributeOverrides
): string[] {
  return Object.keys(values)
    .filter((name) => {
      // `log-*` is drawn by the log badge; skipped by prefix since most are
      // undeclared and can't be claimed.
      if (name.startsWith(LOG_FIELD_PREFIX)) return false
      const chosen = overrides[name]?.badge
      return chosen !== undefined ? chosen : !claimed.has(name)
    })
    .sort()
}

export function registerDefaultBadge() {
  // Re-registering gives a fresh render cache, so claim or override changes repaint.
  bike.observeAttributes((infos) => {
    claimed = new Set(infos.filter((info) => !info.defaultBadge).map((info) => info.name))
    emptyLabelByName.clear()
    registeredNames.clear()
    for (const info of infos) {
      registeredNames.add(info.name)
      if (info.emptyLabel != null) emptyLabelByName.set(info.name, info.emptyLabel)
    }
    registerBadge()
  })

  bike.defaults.observe(ATTRIBUTE_OVERRIDES_KEY, registerBadge)
}

/** `defaultBadge: false` names from the latest `observeAttributes` snapshot. */
let claimed: ReadonlySet<string> = new Set()

let badge: Disposable | undefined

/** Reads overrides here to keep them off the per-row render path. */
function registerBadge() {
  const overrides = readOverrides(bike.defaults.get(ATTRIBUTE_OVERRIDES_KEY))
  const claimedNow = claimed

  badge?.dispose()
  badge = bike.badge('attributes', {
    where: '.*',
    inputs: 'rowAttributes',
    render: (values, env) => {
      const names = unclaimedNames(values, claimedNow, overrides)
      if (names.length === 0) return null
      // Fade tags on closed rows; reads the map since there's no `closed()` here.
      const status = values['status']
      const done = status === 'done' || status === 'canceled'
      const badges = names.flatMap((name) => {
        const image = badgeImage(name, values[name] ?? '', done, env)
        return image ? [{ key: name, image }] : []
      })
      return badges.length > 0 ? badges : null
    },
    // Date labels are now-relative ("Today") and go stale at midnight.
    tick: 60,
    // Keys are attribute names.
    onClick: ({ editor, row, key }) => {
      if (key) editor.showAttributeMenu({ row, anchor: { badge: 'attributes', key } }, key)
    },
  })
}

/**
 * `name:label` with a value. Valueless: the emptyLabel, the name for an
 * unregistered attribute, or null for a registered one without an emptyLabel.
 */
function badgeImage(name: string, value: string, done: boolean, env: BadgeEnvironment): Image | null {
  let label: string
  if (value === '') {
    const emptyLabel = emptyLabelByName.get(name)
    if (emptyLabel == null && registeredNames.has(name)) return null
    label = emptyLabel ?? name
  } else {
    label = `${name}:${truncate(env.formatAttribute(name, value), VALUE_TRUNCATE_LENGTH)}`
  }
  const bm = env.badgeMetrics
  return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(done ? 0.3 : 0.8))).withBackground({
    stroke: env.color.alphaSet(0.3),
    strokeWidth: bm.strokeWidth,
    cornerRadius: bm.cornerRadius,
    padding: bm.padding,
  })
}

const emptyLabelByName = new Map<string, string>()

const registeredNames = new Set<string>()

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) + '…' : value
}
