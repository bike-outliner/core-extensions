import { Row } from 'bike/app'
import { isDayId } from '../dom/protocols'

export function findDateId(row: Row): string | null {
  let current: Row | undefined = row
  while (current) {
    let pid = current.persistentId
    if (pid && isDayId(pid)) return pid
    current = current.parent
  }
  return null
}

export function getDateComponents(date: Date): {
  dayId: string
  dayName: string
} {
  const year = date.getFullYear()
  const dayId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`

  const dayName = formatWith(date, 'dayNameFormat')

  return { dayName, dayId }
}

function formatWith(date: Date, key: string): string {
  const format = bike.defaults.get(key)
  if (typeof format === 'string') {
    return bike.formatDate(date, format)
  }
  if (typeof format === 'object' && !Array.isArray(format)) {
    return new Intl.DateTimeFormat('de-DE', format as Intl.DateTimeFormatOptions).format(date)
  }
  return date.toLocaleDateString('de-DE')
}
