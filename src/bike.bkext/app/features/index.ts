// Bike's DEFAULT FEATURE SET, one file per feature, named after the attribute
// it owns. A feature file holds everything that feature needs in the APP
// context — its attribute, badge, commands, summaries, and defaults — so
// adding or removing one is a file plus a line here.
//
// The command shapes those files share — set / clear / toggle a value on the
// selection, filter the outline to an attribute, open a value picker — live in
// ./helpers, so a feature declares WHICH commands it offers rather than
// re-implementing the same transaction and selection guard each time.
//
// `done` is the one feature with no commands of its own, on purpose: native
// Toggle Done (checkbox, Space, menu bar) already owns completing a row.
//
// Three pieces can't live here, because an extension's contexts have separate
// entry points: `done` renders as row styling (../../style/layer-formatting),
// `tasks` has a settings panel (../../dom/TasksSettings.tsx), and `due`'s badge
// belongs to calendar.bkext, which presents it.
//
// The catch-all badge is NOT a feature — it renders whatever these don't
// claim — so it lives in ../default-badge and registers after everything here.
//
// HOW FEATURES COMPOSE WITH `done`: a checked row is history, and every
// feature treats it that way. Own-attribute badges keep rendering but drop
// urgency/color and fade to their border's alpha (due, priority, flagged,
// estimate — and the catch-all, so any other attribute gets it for free);
// aggregates exclude done from what remains (estimate's remaining summary) or
// measure completion itself (tasks); filters that mean "what needs doing"
// exclude done (due:filter); and the calendar dims all-done days
// (date-marks.ts). Subtree ROLLUP badges (tasks, estimateRemaining) do NOT
// fade on a done row — they present the branch below, not the row's own state.

import { registerDone } from './done'
import { registerDue } from './due'
import { registerPriority } from './priority'
import { registerEstimate } from './estimate'
import { registerFlagged } from './flagged'
import { registerTasks } from './tasks'

export function registerFeatures() {
  registerDone()
  registerDue()
  registerPriority()
  registerEstimate()
  registerFlagged()
  registerTasks()
}
