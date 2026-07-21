import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, SFSymbol } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState, useEffect, useRef } from 'react'
import Calendar from 'react-calendar'
import './Calendar.css'
import { CalendarProtocol, CalendarSelectMode, dayIdFromDate, isDayId } from './protocols'
import {
  bucketByDay,
  calendarQueryPath,
  dayDiffFromToday,
  dayKey,
  dueUrgency,
  isDone,
  parseDue,
  visibleRange,
} from './due-marks'

// Hit-test a pointer/drag event target against a day tile; the date rides on
// the tile's `cal-day-YYYY-MM-DD` class (tileContent spans are
// pointer-events: none, invisible to hit-testing).
function tileFor(target: EventTarget | null) {
  const tile = (target as HTMLElement | null)?.closest?.('.react-calendar__tile')
  const match = tile && Array.from(tile.classList).find((c) => c.startsWith('cal-day-'))
  return match ? { tile, date: match.slice('cal-day-'.length) } : null
}

// What a visit shows: ⌘ = only due items, ⌥ = only day rows, plain = both.
// ⌘ wins when both are held.
function modeFor(e?: { altKey?: boolean; metaKey?: boolean }): CalendarSelectMode {
  return e?.metaKey ? 'due' : e?.altKey ? 'days' : 'all'
}

function CalendarPanel({ context }: { context: DOMExtensionContext<CalendarProtocol> }) {
  const [activeStartDate, setActiveStartDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  // Drag-selected day range, as inclusive dayKeys (zero-padded, so lexical
  // compare is chronological). Persists after mouseup — it mirrors the
  // applied range filter — and clears on any single-day visit, an incoming
  // selectDate, Escape, or a new drag. Deliberately NOT cleared by
  // clearSelection: the app's selection observer posts that ~300ms after
  // every range apply (the caret isn't in a day subtree) and would blink
  // the highlight away.
  const [dragRange, setDragRange] = useState<{ start: string; end: string } | null>(null)
  // Anchor/focus (dayKeys) of the current range selection. The anchor is
  // the fixed end that shift-click / shift-arrows extend from; the focus is
  // the moving end. `dragRange` is its normalized rendered mirror — this
  // ref just remembers which end stays put.
  const rangeRef = useRef<{ anchor: string; focus: string } | null>(null)
  const [showWeekNumbers, setShowWeekNumbers] = useState(() => bike.defaults.get('showWeekNumbers') !== false)
  const [dueByDay, setDueByDay] = useState<Map<string, SessionRow[]>>(new Map())
  // Persistent ids (`YYYY/MM/DD`) of day rows that exist in the outline —
  // their tiles draw a bold day number ("this day has a page").
  const [daysWithRows, setDaysWithRows] = useState<Set<string>>(new Set())
  // "Today" as state, re-anchored at each local midnight (see the timer
  // effect) so day marks, the agenda's Today fallback, and urgency tints don't
  // freeze at the day the panel was opened when it stays up overnight.
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    context.onmessage = (message) => {
      switch (message.type) {
        case 'selectDate': {
          const date = new Date(message.date)
          // The caret's day becomes the anchor for shift-extension.
          rangeRef.current = { anchor: dayKey(date), focus: dayKey(date) }
          setDragRange(null)
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

  useEffect(() => {
    const disposable = bike.defaults.observe('showWeekNumbers', (v) => setShowWeekNumbers(v !== false))
    return () => disposable.dispose()
  }, [])

  // Native row drags (bike:rowdrag* events, delegated on the context
  // element). Dropping rows on a day tile sets their @due to that day —
  // the payload's outline/rows ids are bike.session's, so this works even
  // for rows dragged from a different document. The date rides on the
  // tile's `cal-day-YYYY-MM-DD` class (tileContent spans are
  // pointer-events: none, invisible to the dispatcher's hit-test). Hover
  // highlight is a manual class — native drags don't trigger CSS :hover.
  useEffect(() => {
    const el = context.element
    let hoverTile: Element | null = null
    const setHover = (tile: Element | null) => {
      if (hoverTile === tile) return
      hoverTile?.classList.remove('row-drop-target')
      hoverTile = tile
      hoverTile?.classList.add('row-drop-target')
    }
    const onOver = (e: RowDragEvent) => {
      const hit = tileFor(e.target)
      setHover(hit?.tile ?? null)
      if (hit) e.preventDefault()
    }
    const onLeave = () => setHover(null)
    const onDrop = (e: RowDragEvent) => {
      const hit = tileFor(e.target)
      setHover(null)
      if (!hit) return
      const { outline, rows } = e.detail
      bike.session.updateRows({ outline, rows, attributes: { due: hit.date } })
    }
    el.addEventListener('bike:rowdragover', onOver)
    el.addEventListener('bike:rowdragleave', onLeave)
    el.addEventListener('bike:rowdrop', onDrop)
    return () => {
      el.removeEventListener('bike:rowdragover', onOver)
      el.removeEventListener('bike:rowdragleave', onLeave)
      el.removeEventListener('bike:rowdrop', onDrop)
    }
  }, [])

  // Fire at each local midnight to re-anchor `today`; the query effect below
  // depends on `today`'s day key, so it re-subscribes with a fresh `today()`
  // window after the rollover. The timer re-arms itself for the next midnight.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const scheduleNextMidnight = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        setToday(new Date())
        scheduleNextMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleNextMidnight()
    return () => clearTimeout(timer)
  }, [])

  // Live @due rows AND existing day rows for the displayed month (padded a
  // week each side for neighboring-month tiles), driving the due-mark dots
  // and the bold has-day-row numbers from one query. The session query
  // targets the host window's outline by default and follows tab/document
  // switches; re-subscribe only when the visible MONTH changes — day-level
  // activeStartDate changes keep the same range. A null snapshot (nothing
  // open) and onClose both clear. (The agenda has its own subscription.)
  useEffect(() => {
    let sub: SessionSubscription | undefined
    let canceled = false
    const clear = () => {
      setDueByDay(new Map())
      setDaysWithRows(new Set())
    }
    bike.session
      .observeOutlineQuery(
        { path: calendarQueryPath(visibleRange(activeStartDate), today), shape: 'flat' },
        (snapshot) => {
          const rows = snapshot?.root.children ?? []
          setDueByDay(bucketByDay(rows))
          setDaysWithRows(
            new Set(rows.map((row) => row.persistentId).filter((id): id is string => id != null && isDayId(id)))
          )
        },
        { onClose: clear },
      )
      .then((s) => {
        if (canceled) {
          s.dispose()
        } else {
          sub = s
        }
      })
    return () => {
      canceled = true
      sub?.dispose()
    }
  }, [activeStartDate.getFullYear(), activeStartDate.getMonth(), dayKey(today)])

  const monthYear = activeStartDate.toLocaleDateString(bike.systemLocale, { month: 'long', year: 'numeric' })

  // Filter to the inclusive day range between `anchor` and `focus` dayKeys
  // (either order; single day: same key twice). NEVER creates day rows. The
  // anchor is remembered so shift-click / shift-arrows can extend the range
  // later; the highlight is sticky — it mirrors the applied filter and
  // survives the app's clearSelection echo. `live` marks a refinement of an
  // in-progress gesture (drag growing its range) — the app applies it
  // without pushing a navigation history step, so a whole drag costs one
  // Back step. Read modifiers at event time; they may be released before
  // the async message reaches the app.
  function selectRange(
    anchor: string,
    focus: string,
    mode: CalendarSelectMode,
    options: { live?: boolean } = {}
  ) {
    rangeRef.current = { anchor, focus }
    const [start, end] = anchor <= focus ? [anchor, focus] : [focus, anchor]
    setDragRange({ start, end })
    setSelectedDate(null)
    context.postMessage({
      type: 'showRange',
      start: parseDue(start)!.date.toISOString(),
      end: parseDue(end)!.date.toISOString(),
      mode,
      live: options.live === true,
    })
  }

  // Open a day (Return / double-click): the app creates its row if needed,
  // clears any filter, focuses into the day, and hands keyboard focus to
  // the editor. The day becomes the anchor for later shift-extension.
  function openDay(date: Date) {
    rangeRef.current = { anchor: dayKey(date), focus: dayKey(date) }
    setDragRange(null)
    setSelectedDate(date)
    context.postMessage({ type: 'openDay', date: date.toISOString() })
  }

  // Open a multi-day selection (Return with a range): the app creates a
  // day row for every day in the inclusive range, clears any filter,
  // block-selects those rows in the editor, and hands it keyboard focus.
  // The calendar's range highlight stays put.
  function openRange(start: string, end: string) {
    context.postMessage({
      type: 'openRange',
      start: parseDue(start)!.date.toISOString(),
      end: parseDue(end)!.date.toISOString(),
    })
  }

  // react-calendar's change event now only serves the nav "today" button,
  // which calls it with no event. Tile presses select on MOUSEDOWN (see the
  // mouse effect below), so the click-time change react-calendar fires at
  // mouseup is ignored — it would double-select.
  function onChange(nextValue: any, event?: unknown) {
    if (event) return
    const date = nextValue instanceof Date ? nextValue : new Date(String(nextValue))
    selectRange(dayKey(date), dayKey(date), 'all')
  }

  // Arrow keys walk days like clicks (←/→ ±1 day, ↑/↓ ±7 = one grid row);
  // shift-arrows extend the selection range from its anchor;
  // Return re-visits the selected day and focuses the editor. Listen on
  // window: WebKit doesn't move DOM focus to a button on click, so after a
  // tile click key events dispatch to body and never pass through this
  // panel's element. Capture phase + preventDefault so a focused tile
  // button's own Enter activation can't double-fire, and so arrows don't
  // scroll the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const step =
        e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
      if (step !== 0) {
        e.preventDefault()
        e.stopPropagation()
        const r = rangeRef.current
        if (e.shiftKey && r) {
          // Shift-arrow extends from the anchor: only the focus end moves.
          const f = parseDue(r.focus)!.date
          const next = new Date(f.getFullYear(), f.getMonth(), f.getDate() + step)
          setActiveStartDate(next)
          selectRange(r.anchor, dayKey(next), modeFor(e))
        } else if (r && r.anchor !== r.focus) {
          // A plain arrow on a multi-day selection collapses it to the edge
          // in the arrow's direction (←/↑ = start, →/↓ = end), like a text
          // selection — no stepping.
          const [start, end] = r.anchor <= r.focus ? [r.anchor, r.focus] : [r.focus, r.anchor]
          const key = step < 0 ? start : end
          setActiveStartDate(parseDue(key)!.date)
          selectRange(key, key, modeFor(e))
        } else {
          // Step from the moving end of the current selection, or the
          // caret-mirror selection.
          const base = r ? parseDue(r.focus)!.date : selectedDate ?? today
          const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + step)
          setActiveStartDate(next)
          selectRange(dayKey(next), dayKey(next), modeFor(e))
        }
        return
      }
      if (e.key === 'Enter') {
        if (dragRange && dragRange.start !== dragRange.end) {
          // Multi-day selection: create day rows for every selected day.
          e.preventDefault()
          e.stopPropagation()
          openRange(dragRange.start, dragRange.end)
          return
        }
        // Open the single highlighted day.
        const single =
          dragRange && dragRange.start === dragRange.end ? parseDue(dragRange.start)!.date : selectedDate
        if (single) {
          e.preventDefault()
          e.stopPropagation()
          openDay(single)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [selectedDate, dragRange, today])

  // Double-click a day tile = open the day (create if needed, clear filter,
  // focus the editor), same as Return. The pair's presses applied the day's
  // filter; opening replaces it.
  useEffect(() => {
    const el = context.element
    const onDoubleClick = (e: MouseEvent) => {
      const hit = tileFor(e.target)
      if (!hit) return
      const due = parseDue(hit.date)
      if (!due) return
      e.preventDefault()
      openDay(due.date)
    }
    el.addEventListener('dblclick', onDoubleClick)
    return () => el.removeEventListener('dblclick', onDoubleClick)
  }, [])

  // Mouse selection happens on MOUSEDOWN, not mouseup: pressing a tile
  // immediately selects it and applies its filter (shift-press extends from
  // the current anchor, which then also serves as the drag anchor so a
  // shift-drag keeps extending). Dragging across tiles updates the range —
  // and its applied filter — LIVE on every tile change; those refinements
  // post as `live` so the whole gesture costs one Back step (pushed at
  // mousedown). react-calendar's click → onChange path is dead for tiles
  // (see onChange), so the mouseup click can't double-select. move/up
  // listen on window so drags that leave the panel keep tracking and end
  // anywhere. Escape just ends the drag — whatever range is applied stays.
  // The app NEVER creates day rows for any of this — see visitRange.
  useEffect(() => {
    const el = context.element
    let anchor: string | null = null
    let focus: string | null = null
    let activated = false

    const detach = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onEscape, true)
    }
    const onMouseMove = (e: MouseEvent) => {
      const hit = tileFor(e.target)
      if (hit && hit.date !== focus && anchor) {
        focus = hit.date
        if (focus !== anchor) activated = true
        if (activated) {
          selectRange(anchor, focus, modeFor(e), { live: true })
        }
      }
      if (activated) e.preventDefault()
    }
    const onMouseUp = (e: MouseEvent) => {
      detach()
      if (anchor && focus && activated) {
        // Commit with release-time modifiers; the range itself was already
        // applied by the last tile change.
        selectRange(anchor, focus, modeFor(e), { live: true })
      }
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      detach()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const hit = tileFor(e.target)
      if (!hit) return
      anchor = e.shiftKey && rangeRef.current ? rangeRef.current.anchor : hit.date
      focus = hit.date
      activated = false
      selectRange(anchor, focus, modeFor(e))
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      window.addEventListener('keydown', onEscape, true)
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      detach()
    }
  }, [])

  // Urgency tint matching the due badge, from OPEN items only: red when due
  // today or overdue (an overdue item is a fire whether or not the day is
  // past), orange when due tomorrow, the accent when further out. A day whose
  // due items are ALL @done is history, not a fire — it draws a neutral
  // (tertiary) mark. Count goes in a tooltip — tiles are too small for a number.
  function dueTileMark({ date, view }: { date: Date; view: string }) {
    if (view !== 'month') return null
    const rows = dueByDay.get(dayKey(date))
    if (!rows || rows.length === 0) return null
    const dayDiff = dayDiffFromToday(date, today)
    const anyOpen = rows.some((row) => !isDone(row))
    const variant = anyOpen ? dueUrgency(dayDiff) : 'done'
    return <span className={`due-mark due-mark--${variant}`} title={`${rows.length} due`} />
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
        showWeekNumbers={showWeekNumbers}
        maxDetail="month"
        minDetail="month"
        locale={bike.systemLocale}
        calendarType={bike.systemFirstWeekday === 0 ? 'gregory' : bike.systemFirstWeekday === 6 ? 'islamic' : 'iso8601'}
        formatShortWeekday={(_locale: any, date: Date) => date.toLocaleDateString(bike.systemLocale, { weekday: 'narrow' })}
        tileContent={dueTileMark}
        tileClassName={({ date, view }: { date: Date; view: string }) => {
          if (view !== 'month') return null
          const key = dayKey(date)
          const classes = [`cal-day-${key}`]
          if (dragRange && key >= dragRange.start && key <= dragRange.end) {
            classes.push('cal-range-in')
            if (key === dragRange.start) classes.push('cal-range-start')
            if (key === dragRange.end) classes.push('cal-range-end')
          }
          if (daysWithRows.has(dayIdFromDate(date))) {
            classes.push('cal-has-row')
          }
          return classes
        }}
      />
    </Disclosure>
  )
}

export function activate(context: DOMExtensionContext<CalendarProtocol>) {
  const container = context.element
  const root = createRoot(container)
  root.render(<CalendarPanel context={context} />)
}
