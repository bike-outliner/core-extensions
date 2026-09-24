// Shared between app and DOM contexts.

import { DOMProtocol } from 'bike/core'

export const taskDefaults = {
  showTaskProgressBadges: true,
  taskProgressBadgeType: 'fraction', // TaskProgressBadgeType
  // Read by the status badge (../app/features/status.ts).
  hideDoneBadgeOnTasks: false,
}

export type TaskProgressBadgeType = 'fraction' | 'pie'

// MARK: - Attribute policy

/** A column of the Attributes settings table; the declaration seeds it and the user overrides. */
export type AttributeColumn = 'editor' | 'badge' | 'log'

export const ATTRIBUTE_COLUMNS: readonly AttributeColumn[] = ['editor', 'badge', 'log']

/** Only cells the user changed; absent = at its seed. */
export type AttributeOverride = Partial<Record<AttributeColumn, boolean>>
export type AttributeOverrides = Record<string, AttributeOverride>

/** Native reads it via `AttributeOverridesLoader` as `bike.ext.bike.attributeOverrides`. */
export const ATTRIBUTE_OVERRIDES_KEY = 'attributeOverrides'

/** Mirrors `OutlineStore.logFieldPrefix`. */
export const LOG_FIELD_PREFIX = 'log-'

/**
 * Mirrors `AttributeRegistry.isPolicyEligible`: excludes `log-` twins and
 * `user: false` declarations; undeclared names are eligible.
 */
export function isPolicyEligible(name: string, declaredUser?: boolean): boolean {
  if (name.startsWith(LOG_FIELD_PREFIX)) return false
  return declaredUser !== false
}

/** Editor and Log seed on; Badge follows `defaultBadge`. */
export function seedFor(column: AttributeColumn, defaultBadge?: boolean): boolean {
  return column === 'badge' ? defaultBadge !== false : true
}

/** Keeps whatever parses; the plist may be hand-edited. */
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
 * Sets one cell, or removes it when it equals the seed, so a later change to
 * the declaration's seed still applies.
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

/** Built in the app context, where the declarations are. */
export type AttributeRow = {
  name: string
  title: string
  declared: boolean
  /** Whether an open document uses it now. */
  present: boolean
  seeds: Record<AttributeColumn, boolean>
}

/** Structural `AttributeInfo`: the DOM context has no `bike/app`. */
export type AttributeDeclarationLike = {
  name: string
  title: string
  defaultBadge: boolean
  metadata: Record<string, unknown>
}

/**
 * Rows from declarations, open documents and the override map; the last keeps
 * an override reachable after its document closes.
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
    // By group, then displayed title, then name for stable ties.
    .sort((a, b) => rankOf(a) - rankOf(b) || a.title.localeCompare(b.title) || a.name.localeCompare(b.name))
}

/** Declared, then present, then kept only by an override. */
function rankOf(row: AttributeRow): number {
  if (row.declared) return 0
  return row.present ? 1 : 2
}

export interface AttributesProtocol extends DOMProtocol {
  /** Sent on `ready`/`refresh`, and when the registry or override names change. */
  toDOM: { type: 'attributes'; rows: AttributeRow[] }
  /** `watch` decides whether the app context follows the open documents. */
  toApp: { type: 'ready' } | { type: 'refresh' } | { type: 'watch'; active: boolean }
}
