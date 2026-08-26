import { DOMExtensionContext } from 'bike/dom'
import { Checkbox, Disclosure, RadioGroup, type RadioGroupItem } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { TaskProgressBadgeType } from './protocols'
import { SettingsGroupAccessory } from './settings-group'

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

/** Kept in step by hand with `GuideURL.settingsWindow.anchored("tasks")`, which
 * an extension can't reach. */
const HELP_URL = 'https://www.hogbaysoftware.com/bike/guide/using-bike/settings-window#tasks'

/**
 * What this panel resets TO — including `sortCompletedTasksToEnd`, whose
 * default is native. Reset deletes the keys rather than writing these back, so
 * a default that later changes is still followed.
 */
const DEFAULTS = {
  sortCompletedTasksToEnd: false,
  hideDoneBadgeOnTasks: false,
  showTaskProgressBadges: true,
  taskProgressBadgeType: 'fraction' as TaskProgressBadgeType,
}

// Everything about how tasks behave, in one place. `sortCompletedTasksToEnd` is
// a NATIVE editor setting that happens to be keyed under this extension's
// defaults namespace (see EditorSettings.Key) — `bike.defaults` can only reach
// `bike.ext.bike.*`, and this panel is where the checkbox belongs.
function TasksSection() {
  // Native `EditorSettings.registerDefaults` supplies `false` here, but fall back
  // to it explicitly so the checkbox is never indeterminate if that changes.
  const [sortDone, setSortDone] = useState(() => bike.defaults.get('sortCompletedTasksToEnd') === true)

  // A done task's checkbox and its "Done" badge say the same thing. Off by
  // default — the repetition is what the status badge intends (it reads the
  // same on a task as on any other row), and this is the opt-out for whoever
  // finds it noisy. Only DONE tasks: a canceled one also shows a checked box,
  // so its badge is the only thing telling the two apart.
  const [hideDoneBadge, setHideDoneBadge] = useState(() => bike.defaults.get('hideDoneBadgeOnTasks') === true)

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

  function onHideDoneBadgeChange(value: boolean) {
    setHideDoneBadge(value)
    bike.defaults.set('hideDoneBadgeOnTasks', value)
  }

  function onShowBadgesChange(value: boolean) {
    setShowBadges(value)
    bike.defaults.set('showTaskProgressBadges', value)
  }

  function onBadgeTypeChange(value: TaskProgressBadgeType) {
    setBadgeType(value)
    bike.defaults.set('taskProgressBadgeType', value)
  }

  function onReset() {
    for (const key of Object.keys(DEFAULTS)) bike.defaults.delete(key)
    setSortDone(DEFAULTS.sortCompletedTasksToEnd)
    setHideDoneBadge(DEFAULTS.hideDoneBadgeOnTasks)
    setShowBadges(DEFAULTS.showTaskProgressBadges)
    setBadgeType(DEFAULTS.taskProgressBadgeType)
  }

  const changed =
    sortDone !== DEFAULTS.sortCompletedTasksToEnd ||
    hideDoneBadge !== DEFAULTS.hideDoneBadgeOnTasks ||
    showBadges !== DEFAULTS.showTaskProgressBadges ||
    badgeType !== DEFAULTS.taskProgressBadgeType

  return (
    <Disclosure
      label="Tasks"
      accessory={
        <SettingsGroupAccessory
          canReset={changed}
          onReset={onReset}
          helpURL={HELP_URL}
          helpTitle="Tasks help"
        />
      }
      accessoryAlignment="trailing"
    >
      <Checkbox checked={sortDone} onChange={(e) => onSortDoneChange(e.target.checked)}>
        Sort completed to end of list
      </Checkbox>
      {/* Above the progress-badge checkbox, so that one stays adjacent to the
          radios it owns. */}
      <Checkbox checked={hideDoneBadge} onChange={(e) => onHideDoneBadgeChange(e.target.checked)}>
        Hide Done badge on completed tasks
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
