import { AppExtensionContext, DOMScriptHandle, OutlineEditor, Row, Window } from 'bike/app'
import { todayCommand, weekCommand, monthCommand, yearCommand } from './commands'
import { getDayRow } from './calendar-rows'
import { getDateComponents, findDateId } from './util'
import { CalendarProtocol, CalendarSelectMode, calendarDefaults } from '../dom/protocols'
import { DateAttribute, addDays, dateAttributesFrom, dateRangeClause, dayKey } from '../dom/date-marks'

export async function activate(context: AppExtensionContext) {
  bike.defaults.registerDefaults(calendarDefaults)

  // Every attribute registered with `type: 'date'` shows on the calendar —
  // `due` and `start` today, whatever an extension adds tomorrow — minus
  // the ones opting out with `metadata: { calendar: false }` (`date`, the log's).
  //
  // Live, never a one-shot snapshot: extension activation order isn't
  // guaranteed, so the first fire can predate bike.bkext registering the
  // default set. The registry re-fires on every registration and disposal,
  // and each fire re-pushes to the open panels.
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

    // Joins the broadcast set; the panel pulls its first list with `ready`
    // below (pushing here would race its React commit). Leaving on window
    // close so a registry change doesn't post into a dead webview.
    handles.add(calendarHandle)
    window.onClose(() => handles.delete(calendarHandle))

    /*
    const agendaHandle = await window.inspector.addItem<CalendarProtocol>({
      label: 'Agenda',
      script: 'Agenda.js',
    })
    */

    // Row selected programmatically by the last calendar action — the
    // filter apply's first-match auto-selection (native applyFilter
    // behavior) or openRange's block selection. Those caret moves are NOT
    // user navigation — without remembering them, the selection observer
    // below would echo them back as selectDate and collapse a freshly
    // selected range highlight to that row's day (e.g. select 9–16 and a
    // moment later the highlight snaps to 16, the first existing day row).
    let programmaticSelectionRowId: number | undefined

    // Filter to an inclusive day range (calendar click, arrows, drag; a
    // single day is start === end). NEVER creates day rows — 'all' unions
    // the range's dated rows (every calendar-visible date attribute) with
    // day rows that already exist (and their subtrees), 'dates' (⌘) is just
    // the dated rows, 'days' (⌥) just the existing day rows. Exact-id
    // matches (bounded: a drag spans at most one 42-tile grid) rather than
    // a lexical @id range, which could match unrelated rows whose ids
    // happen to fall inside the window. When the filter matches nothing
    // (empty day, 'days' with no rows, or no date attributes registered at
    // all), the editor shows the filter's emptyMessage centered instead of
    // a blank view.
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
      // One or-chained step matches all the range's existing day rows, and
      // one descendant step their subtrees — much shorter than per-day
      // unions when the range is wide.
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
        // The focus setter pushes a navigation location even when focus is
        // unchanged — skip it while already home, or every live drag
        // refinement would leak a Back step through it.
        if (editor.focus.id !== editor.outline.root.id) {
          editor.focus = editor.outline.root
        }
        editor.filter = {
          // A mode with nothing to union ('days' over a range with no
          // existing day rows, or 'dates' with no date attributes
          // registered): a never-matching path keeps the labeled filter —
          // and its empty message — predictable.
          path: parts.length > 0 ? parts.join(' union ') : '//@id = ""',
          label: labelDates,
          emptyMessage: `**No rows for ${labelDates}**\nReturn or double-click in Calendar to create row`,
          // A live refinement (drag growing its range) doesn't push a
          // navigation step — the gesture's mousedown already did.
          pushLocation: !live,
        }
      })
      programmaticSelectionRowId = editor.selection?.row?.id
    }

    // Open a day (Return / double-click): find-or-create the day row, clear
    // any filter, focus into the day, and hand keyboard focus to the
    // editor. This is the ONLY calendar gesture that creates rows.
    function openDay(editor: OutlineEditor, date: Date) {
      // One transaction so the layer sees a single old→new event — split up
      // (filter, then focus — each JS setter opens its own top-level
      // transaction), the first event starts branch animations for rows the
      // second event then hides, and those layers linger on screen until
      // their spring ends.
      editor.transaction({ label: 'Go to Day', animate: { spring: 'navigation' } }, () => {
        const dateRow = getDayRow(editor.outline, date)
        editor.filter = undefined
        editor.focus = dateRow
        // Caret at the end of the day row's own text — no auto-created
        // empty child.
        editor.selectCaret(dateRow, dateRow.text.string.length)
      })
      editor.activate()
    }

    // Open every day in an inclusive multi-day range (Return with a range
    // selected): find-or-create each day's row, clear any filter, and
    // block-select the created rows so they're ready to act on. The
    // programmatic block selection must not echo back into the calendar —
    // the range highlight stays put.
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
      // The panel's first pull needs no editor — answer it before the guard.
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
          // Consume the filter-apply auto-selection: the first observer fire
          // after a range filter reflects that programmatic caret move, not
          // user navigation — don't echo it into the calendar.
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
