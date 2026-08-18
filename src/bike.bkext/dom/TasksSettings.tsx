import { DOMExtensionContext } from 'bike/dom'
import { Checkbox, Disclosure, RadioGroup, type RadioGroupItem } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { TaskProgressBadgeType } from './protocols'

// One `settings.addItem` per section, each in its own file: the settings pane
// sorts its sections by label, so a section stands on its own rather than
// riding along with whatever else this extension registers.

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<TasksSection />)
}

const TASK_PROGRESS_BADGE_TYPES: RadioGroupItem<TaskProgressBadgeType>[] = [
  { value: 'fraction', label: 'Fraction' },
  { value: 'pie', label: 'Pie chart' },
]

// Everything about how tasks behave, in one place. `sortCompletedTasksToEnd` is
// a NATIVE editor setting that happens to be keyed under this extension's
// defaults namespace (see EditorSettings.Key) — `bike.defaults` can only reach
// `bike.ext.bike.*`, and this panel is where the checkbox belongs.
function TasksSection() {
  // Native `EditorSettings.registerDefaults` supplies `false` here, but fall back
  // to it explicitly so the checkbox is never indeterminate if that changes.
  const [sortDone, setSortDone] = useState(() => bike.defaults.get('sortCompletedTasksToEnd') === true)

  const [showBadges, setShowBadges] = useState(() => bike.defaults.get('showTaskProgressBadges') !== false)

  // Anything unrecognized reads as the 'fraction' default, so a stale or
  // hand-edited value still leaves exactly one radio selected rather than none.
  const [badgeType, setBadgeType] = useState<TaskProgressBadgeType>(() =>
    bike.defaults.get('taskProgressBadgeType') === 'pie' ? 'pie' : 'fraction'
  )

  function onSortDoneChange(value: boolean) {
    setSortDone(value)
    bike.defaults.set('sortCompletedTasksToEnd', value)
  }

  function onShowBadgesChange(value: boolean) {
    setShowBadges(value)
    bike.defaults.set('showTaskProgressBadges', value)
  }

  function onBadgeTypeChange(value: TaskProgressBadgeType) {
    setBadgeType(value)
    bike.defaults.set('taskProgressBadgeType', value)
  }

  return (
    <Disclosure label="Tasks" defaultExpanded>
      <Checkbox checked={sortDone} onChange={(e) => onSortDoneChange(e.target.checked)}>
        Sort completed to end of list
      </Checkbox>
      <Checkbox checked={showBadges} onChange={(e) => onShowBadgesChange(e.target.checked)}>
        Show task progress badge in parents
      </Checkbox>
      {/* The type only means something while the badge is drawn, so it belongs
          TO the checkbox rather than standing beside it: indented to line up
          with that checkbox's label, and disabled when it's off. */}
      <RadioGroup
        items={TASK_PROGRESS_BADGE_TYPES}
        value={badgeType}
        onChange={onBadgeTypeChange}
        disabled={!showBadges}
        style={{ marginLeft: 'var(--bike-checkbox-content-indent)' }}
      />
    </Disclosure>
  )
}
