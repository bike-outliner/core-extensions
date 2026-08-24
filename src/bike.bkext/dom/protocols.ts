// Shared between app and DOM contexts.

import { DOMProtocol } from 'bike/core'

export const taskDefaults = {
  showTaskProgressBadges: true,
  taskProgressBadgeType: 'fraction', // TaskProgressBadgeType
}

/** How the task progress badge draws when it's shown. */
export type TaskProgressBadgeType = 'fraction' | 'pie'

// MARK: - Attribute policy

/**
 * What the user decides about one attribute, in the Attributes settings
 * table. Each column is a question some part of the editor already asked; the
 * declaration seeds the answer and this overrides it.
 */
export type AttributeColumn = 'palette' | 'badge' | 'log'

/** Display order, and the order the table's columns render in. */
export const ATTRIBUTE_COLUMNS: readonly AttributeColumn[] = ['palette', 'badge', 'log']

/** Only the cells the user changed. Absent = still at its seed. */
export type AttributeOverride = Partial<Record<AttributeColumn, boolean>>
export type AttributeOverrides = Record<string, AttributeOverride>

/** The `bike.defaults` key holding them. Native reads the same map through
 * `AttributeOverridesLoader`, under the full `bike.ext.bike.` name. */
export const ATTRIBUTE_OVERRIDES_KEY = 'attributeOverrides'

/**
 * The prefix a recorded value lands under: `priority` records as
 * `log-priority`. Mirrors `OutlineStore.logFieldPrefix`.
 */
export const LOG_FIELD_PREFIX = 'log-'

/**
 * Whether a name may carry user policy at all — the same question
 * `AttributeRegistry.isPolicyEligible` answers natively, and the reason the
 * table, the catch-all badge, and the log rules can't disagree about which
 * names are even in play.
 *
 * Out: the `log-` recorded twins, and anything a declaration marked
 * `user: false`. In: everything else, INCLUDING a name nobody declared.
 * (Reserved names never reach here — the registry rejects them and
 * `outline.attributeNames` filters them.)
 */
export function isPolicyEligible(name: string, declaredUser?: boolean): boolean {
  if (name.startsWith(LOG_FIELD_PREFIX)) return false
  return declaredUser !== false
}

/**
 * The declaration's answer for one column, before the user's. Palette and Log are
 * seeded on for everything eligible; only Badge varies, because
 * `defaultBadge: false` is how an extension says "I present this myself".
 */
export function seedFor(column: AttributeColumn, defaultBadge?: boolean): boolean {
  return column === 'badge' ? defaultBadge !== false : true
}

/** The stored map, keeping whatever parses — it's a plist a person can edit. */
export function readOverrides(value: unknown): AttributeOverrides {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: AttributeOverrides = {}
  for (const [name, cells] of Object.entries(value as Record<string, unknown>)) {
    if (cells == null || typeof cells !== 'object') continue
    const override: AttributeOverride = {}
    for (const column of ATTRIBUTE_COLUMNS) {
      const cell = (cells as Record<string, unknown>)[column]
      if (typeof cell === 'boolean') override[column] = cell
    }
    if (Object.keys(override).length > 0) result[name] = override
  }
  return result
}

/**
 * The map with one cell set — or, when the new value IS the seed, with that
 * cell removed, and the name dropped once nothing is left of it.
 *
 * Storing agreement would freeze it: an attribute whose declaration later
 * changes `defaultBadge` should follow it, and only a cell the user actually
 * disagreed with should hold still. Pure — exported for tests.
 */
export function withCell(
  overrides: AttributeOverrides,
  name: string,
  column: AttributeColumn,
  value: boolean,
  seed: boolean
): AttributeOverrides {
  const next = { ...overrides }
  const entry = { ...next[name] }
  if (value === seed) {
    delete entry[column]
  } else {
    entry[column] = value
  }
  if (Object.keys(entry).length === 0) {
    delete next[name]
  } else {
    next[name] = entry
  }
  return next
}

/** One row of the settings table, built in the app context — where the
 * declarations are — so the panel renders without knowing about them. */
export type AttributeRow = {
  name: string
  /** The declaration's title, or the capitalized name. */
  title: string
  /** Whether any declaration claims it, so the table can say which names
   * merely turned up in a document. */
  declared: boolean
  /** The declaration's answer per column, before this user's. */
  seeds: Record<AttributeColumn, boolean>
}

export interface AttributesProtocol extends DOMProtocol {
  /** Every attribute that may carry policy: declared ones plus whatever the
   * open documents use. Sent in reply to `ready`/`refresh`, and re-pushed
   * whenever the attribute registry changes. */
  toDOM: { type: 'attributes'; rows: AttributeRow[] }
  /** `ready` once the panel can receive; `refresh` when it's about to be
   * looked at, which is when the document scan is worth doing. */
  toApp: { type: 'ready' } | { type: 'refresh' }
}
