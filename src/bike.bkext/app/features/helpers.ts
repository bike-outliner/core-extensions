import { BadgeEnvironment, CommandAction, CommandContext, Image, Row, Text } from 'bike/app'

// The shapes every feature command is built from. Each feature file used to
// hand-roll the same four lines — the `selection?.rows ?? []` guard, the
// transaction, the loop — once per command; with seven features' worth of
// setters, clearers, and filters that's the same code a couple dozen times.
//
// The native write seam does the same job on the Swift side
// (OutlineEditor+SelectionAttributeMenu.swift's `setAttributeOnSelection`),
// but it isn't reachable from an extension, so these are the JS mirror of it —
// same targeting rule (the selected rows, or the caret's row), same one-
// transaction-per-command undo granularity.

// The rows a selection-scoped command acts on: every block-selected row, or
// the single row a caret sits in.
function targets({ selection }: CommandContext): Row[] {
  return selection?.rows ?? []
}

/**
 * Set `name` to `value` on every selected row, in one undo step.
 *
 * `value` may be a thunk, and a value that depends on the wall clock MUST be
 * one: these commands are built once at registration, so a literal
 * `dayStamp(0)` would freeze "today" at whatever day the app launched and
 * quietly write yesterday's date after midnight.
 *
 * Rows that already hold the value are skipped, so re-running a setter on rows
 * that don't change doesn't push an empty transaction onto the undo stack.
 * The command still reports success in that case — the row IS the value asked
 * for, and beeping at someone for setting priority 1 on a priority-1 row would
 * be nonsense. Only a missing editor or an empty selection returns false, which
 * is what lets a keybinding fall through to a lower-priority command.
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

/**
 * Remove `name` from every selected row, in one undo step.
 *
 * Returns false when no selected row carries the attribute — there is nothing
 * to clear, so the command declines rather than pushing an empty transaction.
 * (This is `task:reopen-branch`'s contract, generalized.)
 */
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

/**
 * Remove `name` when EVERY selected row already has it, otherwise set it to
 * `value` on all of them.
 *
 * All-or-nothing rather than per-row, so a mixed selection converges on the
 * attribute instead of inverting into a differently-mixed one — the second
 * invocation then clears the lot.
 */
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
 * Filter the whole outline to `path`, alerting instead when nothing matches.
 *
 * An empty filtered view reads as "your document is empty" — the alert says
 * what actually happened. Focus goes home first so the filter covers the whole
 * outline rather than whatever branch is focused, and both land in one
 * transaction so the layer sees a single old→new event.
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
    // "Show Due" names the navigation step; "Due" names the filter itself.
    editor.transaction({ label: `Show ${spec.label}`, animate: { spring: 'navigation' } }, () => {
      editor.focus = editor.outline.root
      editor.filter = { path: spec.path, label: spec.label }
    })
    return true
  }
}

/**
 * Open the standalone value picker for `name` on the FIRST selected row, and
 * write what it accepts.
 *
 * One row, not the selection: the picker is anchored to a row and seeded from
 * its current value, and there's no coherent seed for a selection holding
 * several different ones. Nothing applies until the picker commits.
 */
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
 * `seconds` as an ISO 8601 duration — the wire form every native formatter and
 * query function speaks.
 *
 * The badges that show a RUNNING clock compute elapsed time as a number in
 * their path expression, but `env.formatValue('duration', …)` wants wire, so
 * this is the one hop between them. Days are the ceiling, matching the native
 * normalizer (`AttributeDuration.normalized`) — a long branch total reads as
 * "1d 6h", never "30h". Negative input clamps to zero: a duration has no
 * direction, and a clock started a moment in the future is a clock at zero.
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

/**
 * The chip an attribute badge draws: one label in a hairline rounded box.
 *
 * The VALUE alone, never `name:value` — the catch-all badge prefixes the name
 * because it renders attributes nobody claimed and the name is all it knows,
 * but a feature's own badge is identified by where it sits and what it looks
 * like. Same box the due, priority and estimate tags use, so a row's chips
 * read as one row of chips rather than several dialects.
 *
 * `alpha` is the one knob: the badges that fade on a closed row pass 0.3, and
 * the ones that ARE the row's state (status, and the log's own chips) keep the
 * default, because fading those would bury exactly what they exist to say.
 */
export function attributeTag(env: BadgeEnvironment, label: string, alpha = 0.8): Image {
  const bm = env.badgeMetrics
  return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), env.color.alphaSet(alpha))).withBackground({
    stroke: env.color.alphaSet(0.3),
    strokeWidth: bm.strokeWidth,
    cornerRadius: bm.cornerRadius,
    padding: bm.padding,
  })
}
