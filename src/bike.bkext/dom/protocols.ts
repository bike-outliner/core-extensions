// Shared between app and DOM contexts.

import { DOMProtocol } from 'bike/core'

export const taskDefaults = {
  showTaskProgressBadges: true,
  taskProgressBadgeType: 'fraction', // TaskProgressBadgeType
  // Read by the `status` badge (../app/features/status.ts), not by the tasks
  // feature — the redundancy it removes is a TASK one, so the switch belongs
  // in the Tasks section even though the badge it narrows is status's.
  hideDoneBadgeOnTasks: false,
}

/** How the task progress badge draws when it's shown. */
export type TaskProgressBadgeType = 'fraction' | 'pie'

// MARK: - Attribute policy

/**
 * What the user decides about one attribute, in the Attributes settings
 * table. Each column is a question some part of the editor already asked; the
 * declaration seeds the answer and this overrides it.
 */
export type AttributeColumn = 'editor' | 'badge' | 'log'

/** Display order, and the order the table's columns render in. */
export const ATTRIBUTE_COLUMNS: readonly AttributeColumn[] = ['editor', 'badge', 'log']

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
 * The declaration's answer for one column, before the user's. Editor and Log are
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
  /** Whether an open document uses it right now. An undeclared row that isn't
   * present is here only because the override map still names it. */
  present: boolean
  /** The declaration's answer per column, before this user's. */
  seeds: Record<AttributeColumn, boolean>
}

/**
 * The slice of `AttributeInfo` a row is built from. Structural rather than
 * imported: this file is shared with the DOM context, which has no `bike/app`.
 */
export type AttributeDeclarationLike = {
  name: string
  title: string
  defaultBadge: boolean
  metadata: Record<string, unknown>
}

/**
 * The table's rows, from the three places a name can come from: a declaration,
 * an open document, or the override map itself.
 *
 * That third source is what keeps a decision reachable. Uncheck a badge for a
 * name a document brought in, close the document, and without it the row —
 * and the only way back to it — would be gone while the override went on
 * applying. Such a row still gets the seeds it would have had, so unchecking
 * it back to agreement drops the override and the row leaves on its own.
 *
 * Pure, so the assembly is testable without an app context.
 */
export function buildRows(
  infos: readonly AttributeDeclarationLike[],
  documentNames: ReadonlySet<string>,
  overrides: AttributeOverrides
): AttributeRow[] {
  const byName = new Map(infos.map((info) => [info.name, info]))
  const names = new Set([...byName.keys(), ...documentNames, ...Object.keys(overrides)])

  return [...names]
    .filter((name) => isPolicyEligible(name, byName.get(name)?.metadata['user'] as boolean | undefined))
    .map((name) => {
      const info = byName.get(name)
      const seeds = {} as AttributeRow['seeds']
      for (const column of ATTRIBUTE_COLUMNS) {
        seeds[column] = seedFor(column, info?.defaultBadge)
      }
      return {
        name,
        title: info?.title ?? name.charAt(0).toUpperCase() + name.slice(1),
        declared: info != null,
        present: documentNames.has(name),
        seeds,
      }
    })
    // Grouped before it's alphabetized, so the attributes Bike and your
    // extensions actually mean read as the list, and the names that merely
    // turned up settle underneath it. Within a group, by what the table SHOWS
    // — a declaration is free to title itself something that sorts elsewhere —
    // with the name breaking ties so a shared title keeps a stable order.
    .sort((a, b) => rankOf(a) - rankOf(b) || a.title.localeCompare(b.title) || a.name.localeCompare(b.name))
}

/** Declared, then merely used, then not even that — the last group being the
 * names kept alive by a setting alone. */
function rankOf(row: AttributeRow): number {
  if (row.declared) return 0
  return row.present ? 1 : 2
}

export interface AttributesProtocol extends DOMProtocol {
  /** Every attribute that may carry policy: declared ones, whatever the open
   * documents use, and any name the override map still holds. Sent in reply to
   * `ready`/`refresh`, and re-pushed whenever the attribute registry changes or
   * the overrides gain or lose a name. */
  toDOM: { type: 'attributes'; rows: AttributeRow[] }
  /** `ready` once the panel can receive; `refresh` when it's about to be
   * looked at; `watch` when the table starts or stops being read, which is the
   * whole of what decides whether the app context follows the open documents. */
  toApp: { type: 'ready' } | { type: 'refresh' } | { type: 'watch'; active: boolean }
}
