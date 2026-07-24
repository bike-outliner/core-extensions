import { BadgeEnvironment, Disposable, Image, Text } from 'bike/app'

// The DEFAULT badge: ONE `bike.badge` whose match-any `where` and
// `inputs: '*'` (the row's full attribute map) render a keyed badge per
// attribute no extension presents (`defaultBadge: false` definitions are
// claimed). The style system re-renders when a row's attributes change;
// the only external state — the claims snapshot — is captured in the
// render closure, and a claims change re-registers the badge. So
// uninstalling e.g. a priority-badge extension hands `priority:2`
// rendering to the default badge with no timers, scans, or reconciliation.
// Clicking a badge opens the NATIVE default attribute menu
// (`menu: 'default'`): filter / standard-value radios / Value… (the
// attribute palette's value stage) / remove — all built in, no menu code
// here.

const VALUE_TRUNCATE_LENGTH = 20

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

export function registerDefaultBadges() {
  let badge: Disposable | undefined

  // The claims + empty-label snapshot is the only state the badges depend
  // on beyond each row's own attributes. Capture it in the render closure
  // and re-register on every change — a fresh badge identity means a fresh
  // render cache, so claims changes repaint without any dirtying protocol.
  // Row-attribute changes re-render through the style system.
  bike.observeAttributes((infos) => {
    const claimed = new Set(infos.filter((info) => !info.defaultBadge).map((info) => info.name))
    emptyLabelByName.clear()
    for (const info of infos) {
      if (info.emptyLabel != null) emptyLabelByName.set(info.name, info.emptyLabel)
    }

    badge?.dispose()
    badge = bike.badge('attributes', {
      where: '.*',
      inputs: '*',
      render: (values, env) => {
        const names = unclaimedNames(values, claimed)
        if (names.length === 0) return null
        return names.map((name) => ({ key: name, image: badgeImage(name, values[name] ?? '', env) }))
      },
      // The built-in attribute menu, targeting the clicked key's attribute.
      menu: 'default',
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

/** The definition-declared empty-value labels ("Flagged"), from the
 * `observeAttributes` snapshot — what a valueless badge renders instead of
 * the raw name. */
const emptyLabelByName = new Map<string, string>()

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) + '…' : value
}
