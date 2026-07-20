import { Row } from 'bike/app'
import { dayIdFromDate, isDayId } from '../dom/protocols'

export function findDateId(row: Row): string | null {
  let current: Row | undefined = row
  while (current) {
    let pid = current.persistentId
    if (pid && isDayId(pid)) return pid
    current = current.parent
  }
  return null
}

export function getMonthsInYear(year: number): Date[] {
  const months: Date[] = []
  for (let month = 0; month < 12; month++) {
    months.push(new Date(year, month, 1))
  }
  return months
}

export function getDaysInMonth(date: Date): Date[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dates: Date[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(new Date(year, month, day))
  }
  return dates
}

export function getDateComponents(date: Date): {
  yearId: string
  monthId: string
  dayId: string
} {
  const year = date.getFullYear()
  const yearId = `${year}/00/00`
  const monthId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/00`
  return { yearId, monthId, dayId: dayIdFromDate(date) }
}
