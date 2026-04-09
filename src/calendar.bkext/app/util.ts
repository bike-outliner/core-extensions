import { Row } from 'bike/app'
import { isDayId } from '../dom/protocols'

export function findDateId(row: Row): string | null {
  let current: Row | undefined = row
  while (current) {
    if (isDayId(current.id)) return current.id
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
  timeName: string
} {
  const year = date.getFullYear()
  const yearId = `${year}/00/00`
  const monthId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/00`
  const dayId = `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`

  const yearName = formatWith(date, "yearNameFormat", "YYYY")
  const monthName = formatWith(date, "monthNameFormat", { year: 'numeric', month: 'long' })
  const dayName = formatWith(date, "dayNameFormat", { dateStyle: 'long' })
  const timeName = formatWith(date, "timeNameFormat", { hour: 'numeric', minute: '2-digit' })

  return { yearName, yearId, monthName, monthId, dayName, dayId, timeName }
}

function formatWith(date: Date, key: string, defaultFormat: string | object): string {
  const format = bike.defaults.get(key) ?? defaultFormat
  if (typeof format === 'string') {
    return format
      .replace('YYYY', String(date.getFullYear()))
      .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(date.getDate()).padStart(2, '0'))
      .replace('hh', String(date.getHours()).padStart(2, '0'))
      .replace('mm', String(date.getMinutes()).padStart(2, '0'))
  }
  if (typeof format === 'object' && !Array.isArray(format)) {
    return new Intl.DateTimeFormat(systemLocale, format as Intl.DateTimeFormatOptions).format(date)
  }
  return date.toLocaleDateString(systemLocale)
}
