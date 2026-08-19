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
// `status`, `log`, and `clock` are the features with no commands of their
// own, on purpose: their commands are native (`status:*`, `clock:*`, and the
// log's single `row:create-log`) because the checkbox, the Space key,
// container creation and folding, and the clock-out-inside-a-status-change
// all need editor state. They are also row-generic — none of the three is
// about tasks; `tasks` is a separate feature that composes on top.
//
// Three pieces can't live here, because an extension's contexts have separate
// entry points: `status` renders as the checkbox and row styling
// (../../style/layer-formatting),
// `tasks` has a settings panel (../../dom/TasksSettings.tsx), and `due`'s badge
// belongs to calendar.bkext, which presents it.
//
// The catch-all badge is NOT a feature — it renders whatever these don't
// claim — so it lives in ../default-badge and registers after everything here.
//
// HOW FEATURES COMPOSE WITH THE OPEN/CLOSED SPLIT: a closed row — done or
// canceled — is history, and every feature treats it that way. Own-attribute
// badges keep rendering but drop urgency/color and fade to their border's
// alpha (due, priority, flagged, estimate — and the catch-all, so any other
// attribute gets it for free); aggregates exclude closed rows from what
// remains (estimate's remaining summary) or measure completion itself
// (tasks); filters that mean "what needs doing" say `open()` (due:filter);
// and the calendar dims all-closed days (date-marks.ts). Subtree ROLLUP
// badges (tasks, estimateRemaining) do NOT fade on a closed row — they
// present the branch below, not the row's own state.
//
// Every one of those says `open()` or `closed()` rather than naming states.
// That is the point of the category being native: adding a fifth state later
// changes none of them.
//
// The `status` badge is the exception to the fade rule, and deliberately: it
// exists to say "canceled", so fading it on a closed row would bury it.

import { registerStatus } from './status'
import { registerLog } from './log'
import { registerClock } from './clock'
import { registerDue } from './due'
import { registerPriority } from './priority'
import { registerEstimate } from './estimate'
import { registerFlagged } from './flagged'
import { registerTasks } from './tasks'

// This order is also DISPLAY order: the row context menu's attribute group
// lists definitions as they were registered, so `status` sits after `due` to
// land where it reads best among the row's other facts. `log` and `clock`
// stay up top with nothing to show for it — their attributes live on entries
// and opt out of that group entirely.
export function registerFeatures() {
  registerLog()
  registerClock()
  registerDue()
  registerStatus()
  registerPriority()
  registerEstimate()
  registerFlagged()
  registerTasks()
}
