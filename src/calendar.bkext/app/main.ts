import { AppExtensionContext, OutlineEditor, Window } from 'bike/app'
import { todayCommand, monthCommand, yearCommand } from './commands'
import { getDayRow } from './calendar-rows'
import { getDateComponents, findDateId } from './util'
import { activateDue } from './due'
import { CalendarProtocol, calendarDefaults } from '../dom/protocols'
import { dayKey } from '../dom/due-marks'

export async function activate(context: AppExtensionContext) {
  bike.defaults.registerDefaults(calendarDefaults)

  // The due badge/commands live here too — the calendar inspector renders
  // the same @due attribute as day marks and a day agenda.
  activateDue()

  bike.commands.addCommands({
    commands: {
      'calendar:today': todayCommand,
      'calendar:month': monthCommand,
      'calendar:year': yearCommand,
    },
  })

  bike.settings.addItem({
    label: 'Calendar',
    script: 'Settings.js',
  })

  bike.observeWindows(async (window: Window) => {
    window.sidebar.addLocation({
      id: 'calendar:today',
      text: 'Today',
      symbol: 'calendar',
      representedRowId: getDateComponents(new Date()).dayId,
      prepareRow: () => {
        const outline = window.currentOutlineEditor!.outline
        return getDayRow(outline, new Date())
      },
      action: () => {
        bike.commands.performCommand('calendar:today')
      },
    })

    const calendarHandle = await window.inspector.addItem<CalendarProtocol>({
      label: 'Calendar',
      script: 'Calendar.js',
    })

    /*
    const agendaHandle = await window.inspector.addItem<CalendarProtocol>({
      label: 'Agenda',
      script: 'Agenda.js',
    })
    */

    // Visit `date` (any calendar day click/arrow/Return/double-click):
    // creates the day row if needed and visits it — agenda filter when the
    // day has due items, else focus the day row. `activate` (Return /
    // double-click) additionally hands keyboard focus to the editor.
    function visitDay(
      editor: OutlineEditor,
      date: Date,
      options: { option: boolean; activate: boolean }
    ) {
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      const dueRange = `@due >=[d] "${dayKey(date)}" and @due <[d] "${dayKey(dayEnd)}"`
      const hasDue = (editor.outline.query(`count(//(${dueRange}))`).value as number) > 0
      const agenda = !options.option && hasDue
      const dayId = getDateComponents(date).dayId

      // Everything in ONE transaction so the layer sees a single old→new
      // event. Split up (focus, then filter — each JS setter opens its own
      // top-level transaction), the first event starts branch animations for
      // rows the second event then filters away, and those layers linger on
      // screen until their spring ends. One event lets the filter change's
      // snap/arrival-slide apply to the whole transition.
      editor.transaction(
        { label: agenda ? 'Show Agenda' : 'Go to Day', animate: { spring: 'navigation' } },
        () => {
          // Materialize the day's row with an empty child for the caret.
          const dateRow = getDayRow(editor.outline, date)
          if (!dateRow.firstChild) {
            editor.outline.insertRows([{}], dateRow)
          }

          // A day with @due items (open or @done): go home and filter to
          // that day's agenda — the due items plus the day row and its whole
          // subtree. The `[d]` half-open day range matches the calendar's
          // day marks (see dueQueryPath); no @done clause, so done items
          // show too.
          if (agenda) {
            editor.focus = editor.outline.root
            editor.filter = {
              // Union of three //-sets: due-on-day, the day row, and the day
              // row's descendants — the descendants must be matched or the
              // filter would collapse them (matches show ancestors, not
              // descendants).
              path: `//(${dueRange}) union //@id = "${dayId}" union //@id = "${dayId}"//*`,
              label: `Agenda ${date.toLocaleDateString(bike.systemLocale, { dateStyle: 'medium' })}`,
            }
          } else {
            // ⌥-commit, or a day with no due items: clear any filter and
            // focus the day row.
            editor.filter = undefined
            editor.focus = dateRow
          }

          // The caret lands on the day's first row (visible under the agenda
          // filter too — its day-row union matches the subtree).
          editor.selectCaret(dateRow.firstChild!, 0)
        }
      )

      if (options.activate) {
        editor.activate()
      }
    }

    calendarHandle.onmessage = (message) => {
      const editor = window.currentOutlineEditor
      if (!editor || message.type !== 'dateChange' || !message.date) return
      visitDay(editor, new Date(message.date), {
        option: message.option === true,
        activate: message.activate === true,
      })
    }

    window.observeCurrentOutlineEditor((editor) => {
      if (editor) {
        editor.observeSelection((selection) => {
          if (!selection) {
            calendarHandle.postMessage({ type: 'clearSelection' })
            // agendaHandle.postMessage({ type: 'clearSelection' })
            return
          }
          const dateId = findDateId(selection.row)
          if (dateId) {
            const [year, month, day] = dateId.split('/').map(Number)
            const date = new Date(year, month - 1, day)
            calendarHandle.postMessage({ type: 'selectDate', date: date.toISOString() })
            // agendaHandle.postMessage({ type: 'selectDate', date: date.toISOString() })
          } else {
            calendarHandle.postMessage({ type: 'clearSelection' })
            // agendaHandle.postMessage({ type: 'clearSelection' })
          }
        }, 300)
      }
    })
  })
}
