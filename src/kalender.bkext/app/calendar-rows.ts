import { Outline, Row } from 'bike/app'
import { dateIdPattern } from '../dom/protocols'
import { getDateComponents } from './util'

export function getDayRow(outline: Outline, date: Date): Row {
  let dateComponents = getDateComponents(date)
  let dateRow = outline.getRowById(dateComponents.dayId)

  if (dateRow) {
    return dateRow
  }

  return outline.transaction({ animate: 'default' }, () => {
    return insertDayRow(dateComponents.dayId, dateComponents.dayName, outline.root)
  })
}

function insertDayRow(dateId: string, text: string, parent: Row): Row {
  let outline = parent.outline
  let row = outline.getRowById(dateId)

  if (row) {
    return row
  }

  let insertBefore: Row | undefined

  for (const child of parent.children) {
    let pid = child.persistentId
    if (pid && pid.match(dateIdPattern) && dateId < pid) {
      insertBefore = child
      break
    }
  }

  return outline.insertRows(
    [
      {
        persistentId: dateId,
        text: `**${text}**`,
        format: 'markdown',
      },
    ],
    parent,
    insertBefore
  )[0]
}
