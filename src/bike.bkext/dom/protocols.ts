// Shared between app and DOM contexts.

export const taskDefaults = {
  showTaskProgressBadges: true,
  taskProgressBadgeType: 'fraction', // TaskProgressBadgeType
}

/** How the task progress badge draws when it's shown. */
export type TaskProgressBadgeType = 'fraction' | 'pie'

export const defaultBadgeDefaults = {
  // Attribute names the DEFAULT badge never draws, comma separated. Stored as
  // the raw string the user typed — not a parsed array — so their spacing and
  // ordering survive a round trip through the settings field.
  hiddenBadgeAttributes: '',
}

/**
 * The attribute names in a `hiddenBadgeAttributes` string. Tolerates the ways
 * someone actually types a list: stray spaces, empty entries from a trailing
 * or doubled comma, newlines (the field is a text area), and a leading `@`,
 * since that's how attributes are written in a document. Pure — exported for
 * tests.
 */
export function parseHiddenBadgeAttributes(value: unknown): Set<string> {
  if (typeof value !== 'string') return new Set()
  const names = value
    .split(/[,\n]/)
    .map((name) => name.trim().replace(/^@/, ''))
    .filter((name) => name.length > 0)
  return new Set(names)
}
