import { AppExtensionContext, DOMScriptHandle, OutlineEditor, Row, Window } from 'bike/app'
import { todayCommand, weekCommand, monthCommand, yearCommand } from './commands'
import { getDayRow } from './calendar-rows'
import { getDateComponents, findDateId } from './util'
import { CalendarProtocol, CalendarSelectMode, calendarDefaults } from '../dom/protocols'
import { DateAttribute, addDays, dateAttributesFrom, dateRangeClause, dayKey } from '../dom/date-marks'

export async function activate(context: AppExtensionContext) {
  bike.defaults.registerDefaults(calendarDefaults)

  // Observed live, not snapshotted: activation order isn't guaranteed, so the
  // first fire can predate bike.bkext's registrations.
  let dateAttributes: DateAttribute[] = []
  const handles = new Set<DOMScriptHandle<CalendarProtocol>>()

  bike.observeAttributes((infos) => {
    dateAttributes = dateAttributesFrom(infos)
    for (const handle of handles) {
      handle.postMessage({ type: 'dateAttributes', attributes: dateAttributes })
    }
  })

  bike.commands.addCommands({
    commands: {
      'calendar:today': todayCommand,
      'calendar:week': weekCommand,
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

    // The panel pulls its first list with `ready` (a push here would race).
    handles.add(calendarHandle)
    window.onClose(() => handles.delete(calendarHandle))

    /*
    const agendaHandle = await window.inspector.addItem<CalendarProtocol>({
      label: 'Agenda',
      script: 'Agenda.js',
    })
    */

    // Row selected programmatically by the last calendar action (filter
    // auto-selection or openRange). Remembered so the selection observer
    // doesn't echo it back and collapse the range highlight.
    let programmaticSelectionRowId: number | undefined

    // Filters to an inclusive day range; never creates day rows. Uses exact
    // day ids (at most 42) rather than a lexical @id range, which could match
    // unrelated rows.
    function visitRange(editor: OutlineEditor, start: Date, end: Date, mode: CalendarSelectMode, live: boolean) {
      const endExclusive = addDays(end, 1)
      const dateClause = dateRangeClause(dateAttributes.map((a) => a.name), start, endExclusive)
      const dateUnions = dateClause ? [`//(${dateClause})`] : []
      const dayIds: string[] = []
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d < endExclusive; d = addDays(d, 1)) {
        const dayId = getDateComponents(d).dayId
        if (editor.outline.getRowById(dayId)) {
          dayIds.push(dayId)
        }
      }
      // One or-chained step rather than per-day unions.
      const dayPredicate = dayIds.map((id) => `@id = "${id}"`).join(' or ')
      const dayUnions = dayIds.length > 0 ? [`//(${dayPredicate})`, `//(${dayPredicate})//*`] : []
      const parts =
        mode === 'dates' ? dateUnions
        : mode === 'days' ? dayUnions
        : [...dateUnions, ...dayUnions]
      const fmt = (d: Date) => d.toLocaleDateString(bike.systemLocale, { dateStyle: 'medium' })
      const singleDay = dayKey(start) === dayKey(end)
      const labelDates = singleDay ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
      editor.transaction({ label: 'Show Agenda', animate: { spring: 'navigation' } }, () => {
        // The focus setter pushes a location even when unchanged, which would
        // leak Back steps during a drag.
        if (editor.focus.id !== editor.outline.root.id) {
          editor.focus = editor.outline.root
        }
        editor.filter = {
          // Never-matching fallback keeps the labeled filter and empty message.
          path: parts.length > 0 ? parts.join(' union ') : '//@id = ""',
          label: labelDates,
          emptyMessage: `**No rows for ${labelDates}**\nReturn or double-click in Calendar to create row`,
          // The drag's mousedown already pushed a step.
          pushLocation: !live,
        }
      })
      programmaticSelectionRowId = editor.selection?.row?.id
    }

    // Return / double-click; with openRange, the only gestures that create rows.
    function openDay(editor: OutlineEditor, date: Date) {
      // One transaction: split up, the first event animates rows the second
      // hides, and those layers linger until their spring ends.
      editor.transaction({ label: 'Go to Day', animate: { spring: 'navigation' } }, () => {
        const dateRow = getDayRow(editor.outline, date)
        editor.filter = undefined
        editor.focus = dateRow
        // No auto-created empty child.
        editor.selectCaret(dateRow, dateRow.text.string.length)
      })
      editor.activate()
    }

    // Return with a range selected; the block selection must not echo back.
    function openRange(editor: OutlineEditor, start: Date, end: Date) {
      const endExclusive = addDays(end, 1)
      editor.transaction({ label: 'Create Days', animate: { spring: 'navigation' } }, () => {
        let first: Row | undefined
        let last: Row | undefined
        for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d < endExclusive; d = addDays(d, 1)) {
          const row = getDayRow(editor.outline, d)
          first ??= row
          last = row
        }
        editor.filter = undefined
        if (editor.focus.id !== editor.outline.root.id) {
          editor.focus = editor.outline.root
        }
        if (first && last) {
          editor.selectRows(first, last)
        }
      })
      programmaticSelectionRowId = editor.selection?.row?.id
      editor.activate()
    }

    calendarHandle.onmessage = (message) => {
      if (message.type === 'ready') {
        calendarHandle.postMessage({ type: 'dateAttributes', attributes: dateAttributes })
        return
      }
      const editor = window.currentOutlineEditor
      if (!editor) return
      switch (message.type) {
        case 'showRange':
          if (!message.start || !message.end) return
          visitRange(
            editor,
            new Date(message.start),
            new Date(message.end),
            message.mode ?? 'all',
            message.live === true
          )
          break
        case 'openDay':
          if (!message.date) return
          openDay(editor, new Date(message.date))
          break
        case 'openRange':
          if (!message.start || !message.end) return
          openRange(editor, new Date(message.start), new Date(message.end))
          break
      }
    }

    window.observeCurrentOutlineEditor((editor) => {
      if (editor) {
        editor.observeSelection((selection) => {
          // Don't echo the programmatic selection into the calendar.
          const autoSelected = programmaticSelectionRowId
          programmaticSelectionRowId = undefined
          if (!selection) {
            calendarHandle.postMessage({ type: 'clearSelection' })
            // agendaHandle.postMessage({ type: 'clearSelection' })
            return
          }
          if (autoSelected !== undefined && selection.row.id === autoSelected) {
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
