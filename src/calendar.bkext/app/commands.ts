import { CommandContext } from 'bike/app'
import { getDayRow, getMonthRow, getYearRow } from './calendar-rows'

export function yearCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    // Always generate the whole year's days; they're injected at whatever
    // nesting the enabled levels produce. `yearRow` is the year row when shown,
    // otherwise the Calendar container.
    let yearRow = getYearRow(outline, new Date())
    editor.focus = yearRow
    editor.selectCaret(yearRow.firstChild ?? yearRow, 0)
  })
  return true
}

export function monthCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    // Always generate the whole month's days, injected at the enabled nesting.
    let monthRow = getMonthRow(outline, new Date())
    editor.focus = monthRow
    editor.selectCaret(monthRow.firstChild ?? monthRow, 0)
  })
  return true
}

export function todayCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    let todayRow = getDayRow(outline, new Date())
    if (!todayRow.firstChild) {
      outline.insertRows([{}], todayRow)
    }
    editor.focus = todayRow
    editor.selectCaret(todayRow.firstChild!, 0)
  })
  return true
}
