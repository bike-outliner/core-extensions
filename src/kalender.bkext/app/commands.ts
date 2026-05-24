import { CommandContext } from 'bike/app'
import { getDayRow } from './calendar-rows'

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
