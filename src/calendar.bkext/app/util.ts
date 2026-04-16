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
  yearName: string
  monthName: string
  dayName: string
} {
  const year = date.getFullYear()
  const yearId = `${year}/00/00`
  const monthId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/00`
  const dayId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`

  const yearName = formatWith(date, "yearNameFormat")
  const monthName = formatWith(date, "monthNameFormat")
  const dayName = formatWith(date, "dayNameFormat")

  return { yearName, yearId, monthName, monthId, dayName, dayId}
}

function formatWith(date: Date, key: string): string {
  const format = bike.defaults.get(key)
  if (typeof format === 'string') {
    return bike.formatDate(date, format)
  }
  if (typeof format === 'object' && !Array.isArray(format)) {
    return new Intl.DateTimeFormat(bike.systemLocale, format as Intl.DateTimeFormatOptions).format(date)
  }
  return date.toLocaleDateString(bike.systemLocale)
}
