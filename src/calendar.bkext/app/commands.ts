import { CommandContext } from 'bike/app'
import { getDayRow, getMonthRow, getWeekRow, getYearRow } from './calendar-rows'

export function yearCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    // `yearRow` is the year row when shown, otherwise the Calendar container.
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
    let monthRow = getMonthRow(outline, new Date())
    editor.focus = monthRow
    editor.selectCaret(monthRow.firstChild ?? monthRow, 0)
  })
  return true
}

export function weekCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    let weekRow = getWeekRow(outline, new Date())
    editor.focus = weekRow
    editor.selectCaret(weekRow.firstChild ?? weekRow, 0)
  })
  return true
}

export function todayCommand(context: CommandContext): boolean {
  let editor = context.editor
  if (!editor) return true
  editor.outline.transaction({ animate: 'default' }, () => {
    let outline = editor.outline
    let todayRow = getDayRow(outline, new Date())
    editor.filter = undefined
    editor.focus = todayRow
    // No auto-created empty child.
    editor.selectCaret(todayRow, todayRow.text.string.length)
  })
  return true
}
