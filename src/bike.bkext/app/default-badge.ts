import { BadgeEnvironment, Disposable, Image, Text } from 'bike/app'
import { defaultBadgeDefaults, parseHiddenBadgeAttributes } from '../dom/protocols'

// The DEFAULT badge: ONE `bike.badge` whose match-any `where` and
// `inputs: 'rowAttributes'` (the row's full attribute map) render a keyed
// badge per attribute no extension presents (`defaultBadge: false`
// definitions are claimed). Reading the map rather than declared names is
// what lets it render attributes nobody registered. The style system
// re-renders when a row's attributes change; the only external state — the
// claims snapshot — is captured in the render closure, and a claims change
// re-registers the badge. So uninstalling e.g. a priority-badge extension
// hands `priority:2` rendering to the default badge with no timers, scans,
// or reconciliation.
// Clicking a glyph opens the NATIVE attribute menu for that glyph's key
// (`editor.showAttributeMenu`), which is TYPE-AWARE: boolean Yes/No, choice
// radios, else "Value…" — all built in, no menu code here.
//
// Labels go through `env.formatAttribute`, the same native display layer the
// palette and pickers use, so a `duration` reads "1h 30m" and a `date` reads
// "Today" rather than showing its raw wire encoding.
//
// A user can opt individual attributes out entirely — Settings > Extensions >
// Default Badge Exclusions — for files another tool writes into, where a sync
// id or a hash isn't meant to be read as content. That list only reaches THIS
// badge, so an attribute an extension presents itself is never affected.

const VALUE_TRUNCATE_LENGTH = 20

/**
 * The badge-worthy attribute names of a row's attribute map: everything not
 * claimed by a `defaultBadge: false` definition and not hidden by the user,
 * sorted. (`values` already excludes the reserved names — `inputs:
 * 'rowAttributes'` filters them natively.) Pure — exported for tests.
 */
export function unclaimedNames(
  values: Readonly<Record<string, string | undefined>>,
  claimed: ReadonlySet<string>,
  hidden: ReadonlySet<string>
): string[] {
  return Object.keys(values)
    .filter((name) => !claimed.has(name) && !hidden.has(name))
    .sort()
}

export function registerDefaultBadge() {
  bike.defaults.registerDefaults(defaultBadgeDefaults)

  // Two things outside a row's own attributes decide what this badge draws:
  // the claims snapshot and the user's hidden list. Both are captured in the
  // render closure, and both re-register — a fresh badge identity means a
  // fresh render cache, so either change repaints without any dirtying
  // protocol. Row-attribute changes re-render through the style system.
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

  bike.defaults.observe('hiddenBadgeAttributes', registerBadge)
}

/** The `defaultBadge: false` names, from the latest `observeAttributes`
 * snapshot — the attributes an extension presents itself. */
let claimed: ReadonlySet<string> = new Set()

let badge: Disposable | undefined

/** Dispose the live badge and register a fresh one against current state.
 * Parsing the hidden list HERE rather than in `render` keeps it off the
 * per-row path — it only changes when the setting does. */
function registerBadge() {
  const hidden = parseHiddenBadgeAttributes(bike.defaults.get('hiddenBadgeAttributes'))
  const claimedNow = claimed

  badge?.dispose()
  badge = bike.badge('attributes', {
    where: '.*',
    inputs: 'rowAttributes',
    render: (values, env) => {
      const names = unclaimedNames(values, claimedNow, hidden)
      // Every attribute hidden (or none to begin with) draws nothing at
      // all — no glyph and no reserved slot.
      if (names.length === 0) return null
      // `status` is claimed (the checkbox and the status badge present it),
      // but it's still in the attribute map — and this badge reads the row's
      // OWN attributes rather than path inputs, so it asks the map directly
      // instead of calling `closed()`. On a closed row every tag fades to its
      // border's alpha, the same treatment the feature badges give theirs, so
      // no tag ever reads as live work on a finished row.
      const status = values['status']
      const done = status === 'done' || status === 'canceled'
      const badges = names.flatMap((name) => {
        const image = badgeImage(name, values[name] ?? '', done, env)
        return image ? [{ key: name, image }] : []
      })
      return badges.length > 0 ? badges : null
    },
    // A catch-all renders whatever types a document uses, including
    // dates — whose labels are now-relative ("Today", "Yesterday"), so
    // they'd go stale at midnight without a tick.
    tick: 60,
    // Each glyph is keyed by its attribute name, so the clicked key IS
    // the attribute the built-in menu should edit.
    onClick: ({ editor, row, key }) => {
      if (key) editor.showAttributeMenu({ row, anchor: { badge: 'attributes', key } }, key)
    },
  })
}

/**
 * A generic drawn tag for one attribute, or null for a valueless tag with no
 * bare meaning. With a value the label is `name:label` (colon-tight, the
 * DISPLAY form, never the raw wire value). Valueless, the label is what the
 * definition SAYS bare means — its emptyLabel — or, for an unregistered name,
 * the name itself (a plain `@tag` is its own meaning). A REGISTERED attribute
 * that declares no emptyLabel draws nothing when valueless: its definition
 * knows the real values, and a bare name tag would just restate the
 * attribute without saying anything.
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

/** The definition-declared empty-value labels ("Flagged"), from the
 * `observeAttributes` snapshot — what a valueless badge renders instead of
 * the raw name. */
const emptyLabelByName = new Map<string, string>()

/** Every registered attribute name from the same snapshot — how badgeImage
 * tells "bare, and the definition declares no bare meaning" (skip) from
 * "bare and nobody registered it" (render the name). */
const registeredNames = new Set<string>()

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) + '…' : value
}
