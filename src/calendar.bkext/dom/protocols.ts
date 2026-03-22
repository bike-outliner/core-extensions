// Define the messaging protocol between app and DOM contexts here.
// This file is typechecked in both contexts, so app/main.ts and DOM
// scripts can import from it to share a single protocol definition.

import { DOMProtocol } from 'bike/core'

export const dateIdPattern = /^\d{4}\/\d{2}\/\d{2}$/

export function isDayId(id: string): boolean {
  if (!dateIdPattern.test(id)) return false
  const day = Number(id.split('/')[2])
  return day > 0
}

export function parseDateId(id: string): Date | null {
  if (!dateIdPattern.test(id)) return null
  const [year, month, day] = id.split('/').map(Number)
  if (day === 0) return null
  return new Date(year, month - 1, day)
}

export interface CalendarProtocol extends DOMProtocol {
  toDOM:
    | { type: 'selectDate'; date: string }
    | { type: 'clearSelection' }
  toApp: { type: 'dateChange'; date: string }
}
