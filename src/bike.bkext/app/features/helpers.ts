import { BadgeEnvironment, CommandAction, CommandContext, Image, Row, Text } from 'bike/app'

// Shared feature command builders; JS mirror of the native
// `setAttributeOnSelection` (OutlineEditor+SelectionAttributeMenu.swift):
// selected rows or the caret's row, one transaction per command.

function targets({ selection }: CommandContext): Row[] {
  return selection?.rows ?? []
}

/**
 * Sets `name` on every selected row in one undo step. Clock-dependent values
 * must be thunks, or "today" freezes at launch. Unchanged rows are skipped but
 * still return true; false only for no editor or empty selection.
 */
export function setAttributeOnSelection(name: string, value: string | (() => string), label: string): CommandAction {
  return (context: CommandContext): boolean => {
    const { editor } = context
    const rows = targets(context)
    if (!editor || rows.length === 0) return false
    const resolved = typeof value === 'function' ? value() : value
    const changing = rows.filter((row) => row.getAttribute(name) !== resolved)
    if (changing.length === 0) return true
    editor.outline.transaction({ label }, () => {
      for (const row of changing) row.setAttribute(name, resolved)
    })
    return true
  }
}

/** Removes `name` from selected rows in one undo step; false when none carry it. */
export function clearAttributeOnSelection(name: string, label: string): CommandAction {
  return (context: CommandContext): boolean => {
    const { editor } = context
    const rows = targets(context)
    if (!editor) return false
    const present = rows.filter((row) => row.getAttribute(name) != null)
    if (present.length === 0) return false
    editor.outline.transaction({ label }, () => {
      for (const row of present) row.removeAttribute(name)
    })
    return true
  }
}

/** Removes `name` when every selected row has it, else sets it on all (mixed converges). */
export function toggleAttributeOnSelection(name: string, value: string, label: string): CommandAction {
  return (context: CommandContext): boolean => {
    const { editor } = context
    const rows = targets(context)
    if (!editor || rows.length === 0) return false
    const allHave = rows.every((row) => row.getAttribute(name) != null)
    editor.outline.transaction({ label }, () => {
      for (const row of rows) {
        if (allHave) row.removeAttribute(name)
        else row.setAttribute(name, value)
      }
    })
    return true
  }
}

/**
 * Filters the whole outline to `path`, alerting when nothing matches. Focus
 * and filter change in one transaction so the layer sees a single event.
 */
export function filterCommand(spec: {
  path: string
  label: string
  emptyTitle: string
  emptyMessage: string
}): CommandAction {
  return ({ editor }: CommandContext): boolean => {
    if (!editor) return false
    if ((editor.outline.query(`count(${spec.path})`).value as number) === 0) {
      bike.showAlert(
        {
          title: spec.emptyTitle,
          message: spec.emptyMessage,
          style: 'informational',
          buttons: ['OK'],
        },
        bike.frontmostWindow
      )
      return true
    }
    editor.transaction({ label: `Show ${spec.label}`, animate: { spring: 'navigation' } }, () => {
      editor.focus = editor.outline.root
      editor.filter = { path: spec.path, label: spec.label }
    })
    return true
  }
}

/** Opens the value picker on the first selected row only, since it's seeded from one value. */
export function pickAttributeForSelection(name: string): CommandAction {
  return (context: CommandContext): boolean => {
    const { editor } = context
    const rows = targets(context)
    if (!editor || rows.length === 0) return false
    editor.showPicker({ row: rows[0] }, {
      source: { attribute: name },
      onAccept: (value) => rows[0].setAttribute(name, value),
    })
    return true
  }
}

/**
 * `seconds` as an ISO 8601 duration. Days are the largest unit, matching
 * `AttributeDuration.normalized`; negative input clamps to zero.
 */
export function isoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
  if (total === 0) return 'PT0S'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const time = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs ? `${secs}S` : ''}`
  return `P${days ? `${days}D` : ''}${time ? `T${time}` : ''}`
}

// MARK: - Badges

/** One label in a hairline rounded box; value only, never `name:value`. */
export function attributeTag(env: BadgeEnvironment, label: string, alpha = 0.8): Image {
  const bm = env.badgeMetrics
  return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(alpha))).withBackground({
    stroke: env.color.alphaSet(0.3),
    strokeWidth: bm.strokeWidth,
    cornerRadius: bm.cornerRadius,
    padding: bm.padding,
  })
}
