import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import Calendar from 'react-calendar'
import './Calendar.css'
import { CalendarProtocol } from './protocols'

function CalendarPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [activeStartDate, setActiveStartDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'selectDate': {
          const date = new Date(message.date)
          setSelectedDate(date)
          setActiveStartDate(date)
          break
        }
        case 'clearSelection':
          setSelectedDate(null)
          break
      }
    }
    return () => {
      context.onmessage = undefined
    }
  }, [])

  const monthYear = activeStartDate.toLocaleDateString(systemLocale, { month: 'long', year: 'numeric' })

  function onChange(nextValue: any) {
    const date = nextValue instanceof Date ? nextValue : new Date(String(nextValue))
    setSelectedDate(date)
    context.postMessage({
      type: 'dateChange',
      date: date.toISOString(),
    })
  }

  const navBar = (
    <div className="calendar-nav-bar">
      <button className="calendar-nav-button" onClick={() => setActiveStartDate(d => new Date(d.getFullYear(), d.getMonth() - 1))} type="button">
        <SFSymbol name="chevron.backward" scale="small" />
      </button>
      <button className="calendar-nav-button" onClick={() => { setActiveStartDate(new Date()); onChange(new Date()) }} type="button">
        <SFSymbol name="suit.diamond" scale="small" />
      </button>
      <button className="calendar-nav-button" onClick={() => setActiveStartDate(d => new Date(d.getFullYear(), d.getMonth() + 1))} type="button">
        <SFSymbol name="chevron.forward" scale="small" />
      </button>
    </div>
  )

  return (
    <Disclosure
      className="calendar-disclosure"
      label={monthYear}
      accessory={navBar}
      accessoryAlignment="trailing"
      defaultExpanded
    >
      <Calendar
        className={selectedDate ? '' : 'no-selection'}
        onChange={onChange}
        value={selectedDate}
        activeStartDate={activeStartDate}
        onActiveStartDateChange={({ activeStartDate: d }) => { if (d) setActiveStartDate(d) }}
        showNavigation={false}
        maxDetail="month"
        minDetail="month"
        locale={systemLocale}
        calendarType={systemFirstWeekday === 0 ? 'gregory' : systemFirstWeekday === 6 ? 'islamic' : 'iso8601'}
        formatShortWeekday={(_locale: any, date: Date) => date.toLocaleDateString(systemLocale, { weekday: 'narrow' })}
      />
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<CalendarPanel context={context} />)
}
