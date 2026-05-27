import { DOMExtensionContext } from 'bike/dom'
import { JSONValue } from 'bike/core'
import { Box, Checkbox, Disclosure, FormRow, FormGroup, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { calendarDefaults, substituteDate } from './protocols'

type FormatKey = 'yearNameFormat' | 'monthNameFormat' | 'dayNameFormat'
type EnableKey = 'yearEnabled' | 'monthEnabled'

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<SettingsPanel />)
}

function SettingsPanel() {
  const [yearEnabled, setYearEnabled] = useState(() => bike.defaults.get('yearEnabled') !== false)
  const [monthEnabled, setMonthEnabled] = useState(() => bike.defaults.get('monthEnabled') !== false)

  function toggle(key: EnableKey, set: (value: boolean) => void) {
    return (checked: boolean) => {
      set(checked)
      bike.defaults.set(key, checked)
    }
  }

  // Indent each preview by the number of enabled levels above it, mirroring the
  // generated outline nesting.
  const aboveMonth = yearEnabled ? 1 : 0
  const aboveDay = (yearEnabled ? 1 : 0) + (monthEnabled ? 1 : 0)

  return (
    <Disclosure label="Calendar" defaultExpanded>
      <WeekNumbersRow />

      <Box>
        <p>
          Format patterns used to generate calendar rows:
        </p>

        <ul>
          <li>Include date <code>{'{'}</code> <a href="https://date-fns.org/docs/format">pattern</a> <code>{'}'}</code> or JSON Intl.DateTimeFormat{' '}
          <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat#using_options">options</a>.</li>
          <li>Use markdown outside the braces for row formatting — <code>{'# { yyyy }'}</code> is a heading.</li>
          <li>Uncheck Year or Month if you want the calendar to skip those levels.</li>
        </ul>

        <FormGroup>
          <FormatRow
            label="Year"
            formatKey="yearNameFormat"
            enabled={yearEnabled}
            onToggle={toggle('yearEnabled', setYearEnabled)}
            indent={0}
          />
          <FormatRow
            label="Month"
            formatKey="monthNameFormat"
            enabled={monthEnabled}
            onToggle={toggle('monthEnabled', setMonthEnabled)}
            indent={aboveMonth}
          />
          <FormatRow label="Day" formatKey="dayNameFormat" enabled indent={aboveDay} deepest />
        </FormGroup>
      </Box>

    </Disclosure>
  )
}

function FormatRow({
  label,
  formatKey,
  enabled,
  onToggle,
  indent,
  deepest = false,
}: {
  label: string
  formatKey: FormatKey
  enabled: boolean
  onToggle?: (checked: boolean) => void
  indent: number
  deepest?: boolean
}) {
  const [value, setValue] = useState(() => readDisplay(formatKey))
  const defaultDisplay = displayValue(calendarDefaults[formatKey])

  function onChange(input: string) {
    setValue(input)
    if (input === '') {
      bike.defaults.delete(formatKey)
    } else {
      // The field is stored verbatim; the date spec inside `{ … }` is parsed
      // when rows are generated, not here.
      bike.defaults.set(formatKey, input)
    }
  }

  const dim = { opacity: enabled ? 1 : 0.5 }

  return (
    <FormRow label={<span style={dim}>{label}</span>} style={{ alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {/* Fixed-width slot (reserved even for the disabled Day checkbox) so
            every text field shares the same leading edge; trailing margin = gap. */}
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '20px',
            marginRight: '8px',
          }}
        >
          {onToggle ? (
            <Checkbox checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          ) : (
            // Day is always included — show it checked but disabled.
            <Checkbox checked disabled readOnly />
          )}
        </span>
        <input
          type="text"
          value={value}
          placeholder={defaultDisplay}
          onChange={(e) => onChange(e.target.value)}
          style={dim}
          autoCorrect="off" autoComplete="off" spellCheck={false} autoCapitalize="off"
        />
        {enabled && <Preview indent={indent} deepest={deepest}>{preview(value, defaultDisplay)}</Preview>}
      </span>
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

function Preview({
  children,
  indent = 0,
  deepest = false,
}: {
  children: React.ReactNode
  indent?: number
  deepest?: boolean
}) {
  // 6px gap from the field + one indent step per enabled ancestor level. The
  // disclosure triangle mimics a Bike row: leaf rows point forward (collapsed),
  // rows with generated children below point down (expanded).
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        color: 'var(--secondary-label)',
        marginLeft: `${6 + indent * 16}px`,
      }}
    >
      <SFSymbol name={deepest ? 'arrowtriangle.forward' : 'arrowtriangle.down'} scale="small" />
      {children}
    </span>
  )
}

function preview(value: string, defaultValue: string): string {
  const raw = value || defaultValue
  try {
    return substituteDate(new Date(), raw)
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
