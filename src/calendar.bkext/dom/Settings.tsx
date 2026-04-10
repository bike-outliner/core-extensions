import { DOMExtensionContext } from 'bike/dom'
import { JSONValue } from 'bike/core'
import { Checkbox, Disclosure, FormRow, FormGroup } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { calendarDefaults } from './protocols'

type FormatKey = keyof typeof calendarDefaults

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<SettingsPanel />)
}

function SettingsPanel() {
  return (
    <Disclosure label="Calendar" defaultExpanded>
      <WeekNumbersRow />
      <ul>
        <li>Date format patterns used to generate row text.</li>
        <li>Use format <a href="https://date-fns.org/docs/format">patterns</a> or JSON encoded Intl.DateTimeFormat <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat#using_options">options</a>.</li>
        <li>Patterns are used when creating new rows, existing rows will not change.</li>
      </ul>
      <FormGroup>
        <FormatRow label="Year" formatKey="yearNameFormat" />
        <FormatRow label="Month" formatKey="monthNameFormat" />
        <FormatRow label="Day" formatKey="dayNameFormat" />
      </FormGroup>
    </Disclosure>
  )
}

function FormatRow({ label, formatKey }: { label: string; formatKey: FormatKey }) {
  const [value, setValue] = useState(() => readDisplay(formatKey))
  const defaultDisplay = displayValue(calendarDefaults[formatKey])

  function onChange(input: string) {
    setValue(input)
    if (input === '') {
      bike.defaults.delete(formatKey)
    } else {
      try {
        bike.defaults.set(formatKey, parseInput(input))
      } catch {
        // Don't store invalid JSON objects while user is still typing
      }
    }
  }

  return (
    <FormRow label={label}>
      <input
        type="text"
        value={value}
        placeholder={defaultDisplay}
        onChange={(e) => onChange(e.target.value)}
        autoCorrect="off" autoComplete="off" spellCheck={false} autoCapitalize="off"
      />
      <Preview>{preview(value, defaultDisplay)}</Preview>
    </FormRow>
  )
}

function WeekNumbersRow() {
  const [checked, setChecked] = useState(() => bike.defaults.get('showWeekNumbers') !== false)

  function onChange(value: boolean) {
    setChecked(value)
    bike.defaults.set('showWeekNumbers', value)
  }

  return (
    <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>
      Show week number in left column
    </Checkbox>
  )
}

function Preview({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--secondary-label)', marginLeft: '6px' }}>{children}</span>
}

function preview(value: string, defaultValue: string): string {
  const raw = value || defaultValue
  const now = new Date()
  try {
    if (raw.trimStart().startsWith('{')) {
      return new Intl.DateTimeFormat(bike.systemLocale, JSON.parse(raw)).format(now)
    }
    return bike.formatDate(now, raw)
  } catch {
    return '(invalid format)'
  }
}

/** Convert a JSONValue to its display string representation. */
function displayValue(value: JSONValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

/** Read a setting for display. Returns empty string if value matches the default. */
function readDisplay(key: FormatKey): string {
  const value = bike.defaults.get(key)
  if (value === undefined) return ''
  if (JSON.stringify(value) === JSON.stringify(calendarDefaults[key])) return ''
  return displayValue(value)
}

/** Parse user input for storage: text starting with { is parsed as an object, otherwise stored as a string. */
function parseInput(input: string): JSONValue {
  if (input.trimStart().startsWith('{')) {
    return JSON.parse(input)
  }
  return input
}
