// Attribute editing is the native attribute palette (the @ button's
// two-stage names/values panel), driven by the registry populated here.
//
// The DEFAULT ATTRIBUTE SET: the shapes (type, values, parsing) of the
// attributes Bike treats as common vocabulary — done, due, priority, status,
// start, estimate, flagged — each in its own file under this folder, and
// registered centrally so every extension sharing them reads the same
// `AttributeInfo` contract. Presentation stays where it belongs:
// calendar.bkext renders the due badge; done renders as row styling; the rest
// go through the default badge (../badges/default).

import { registerDone } from './done'
import { registerDue } from './due'
import { registerPriority } from './priority'
import { registerStatus } from './status'
import { registerStart } from './start'
import { registerEstimate } from './estimate'
import { registerFlagged } from './flagged'

export function registerAttributes() {
  // Registration order sets the bare-`@` popup's quick-effect group order:
  // shortcut owners (done, due, priority) first.
  registerDone()
  registerDue()
  registerPriority()
  registerStatus()
  registerStart()
  registerEstimate()
  registerFlagged()
}
