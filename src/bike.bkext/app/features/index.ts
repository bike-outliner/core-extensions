// Bike's default feature set: one app-context file per attribute, with shared
// command builders in ./helpers. `status`, `log` and `clock` commands are
// native since they need editor state. Styling lives in
// ../../style/layer-formatting, the tasks panel in ../../dom/TasksSettings.tsx.
//
// A closed row (done or canceled) is history: own-attribute badges fade,
// aggregates exclude it, filters say `open()`. Subtree rollups and the status
// badge don't fade. Always use `open()`/`closed()` rather than naming states.

import { registerStatus } from './status'
import { registerLog } from './log'
import { registerClock } from './clock'
import { registerDue } from './due'
import { registerPriority } from './priority'
import { registerEstimate } from './estimate'
import { registerFlagged } from './flagged'
import { registerTasks } from './tasks'

// Order is also the context menu's attribute group order.
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
