import { AppExtensionContext, Window } from 'bike/app'
import { todayCommand, monthCommand, yearCommand } from './commands'
import { getDayRow } from './calendar-rows'
import { getDateComponents, findDateId } from './util'
import { CalendarProtocol, calendarDefaults } from '../dom/protocols'

export async function activate(context: AppExtensionContext) {
  defaults.registerDefaults(calendarDefaults)

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
      action: () => {
        bike.commands.performCommand('calendar:today')
      },
    })

    const calendarHandle = await window.inspector.addItem<CalendarProtocol>({
      label: 'Calendar',
      script: 'Calendar.js',
    })

    calendarHandle.onmessage = (message) => {
      let editor = window.currentOutlineEditor

      if (editor && message.type === 'dateChange' && message.date) {
        let outline = editor.outline
        let dateRow = getDayRow(editor.outline, new Date(message.date))
        if (!dateRow.firstChild) {
          outline.insertRows([{}], dateRow)
        }
        editor.focus = dateRow
        editor.selectCaret(dateRow.firstChild!, 0)
      }
    }

    window.observeCurrentOutlineEditor((editor) => {
      if (editor) {
        editor.observeSelection((selection) => {
          if (!selection) {
            calendarHandle.postMessage({ type: 'clearSelection' })
            return
          }
          const dateId = findDateId(selection.row)
          if (dateId) {
            const [year, month, day] = dateId.split('/').map(Number)
            const date = new Date(year, month - 1, day)
            calendarHandle.postMessage({ type: 'selectDate', date: date.toISOString() })
          } else {
            calendarHandle.postMessage({ type: 'clearSelection' })
          }
        }, 300)
      }
    })
  })
}
