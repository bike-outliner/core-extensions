# Calendar

A notes-by-date workflow for Bike. Adds a `Today` button and a month-grid
calendar to the sidebar, and generates a `Calendar → Year → Month → Day`
outline structure on demand so you can keep dated notes without bookkeeping.

## Sidebar

- **Today** — sidebar location. Jumps to today, creating the day row if it
  does not yet exist, and places the cursor at its first child so you can
  start typing.

## Inspector

- **Calendar** — inspector panel. A month grid; click a date to jump there.
  Header controls (visible on hover): ‹ previous month, ◆ today, › next month.
  Selecting any row inside the date hierarchy highlights the matching day in
  the grid.

## Outline structure

The extension keeps your dated notes under a top-level `Calendar` row:

    Calendar
    └─ 2026
       └─ April 2026
          └─ Monday, April 27, 2026
             └─ <your notes here>

Rows are created on demand — picking April 27 only creates the rows above it
that do not yet exist, and inserts them in chronological order among their
siblings. Existing day rows are reused, never duplicated.

Each calendar row carries a stable `persistentId` of the form `YYYY/MM/DD`
(`YYYY/MM/00` for months, `YYYY/00/00` for years, `calendar` for the root).
This is what links the calendar UI to outline rows, so you can freely edit
the visible text of any year, month, or day row without breaking anything.

## Commands

- `calendar:today` — jump to today, create the day row if missing, and place
  the cursor at its first child. (This is also what the sidebar Today button
  runs.)
- `calendar:month` — open the current month and pre-create every day in it.
- `calendar:year` — open the current year and pre-create every month and
  every day in it.

Run them from the command palette, or bind keyboard shortcuts to them in
Bike's keybindings.

## Settings

Open Bike's Settings and choose the **Calendar** pane.

- **Show week numbers** — toggle the week-number column in the calendar grid.
- **Year / Month / Day format** — controls the visible text of year, month,
  and day rows. Each field accepts either:
  - a [date-fns format string](https://date-fns.org/docs/format) — e.g.
    `yyyy`, `yyyy-MM-dd`, `MMMM d`
  - a JSON `Intl.DateTimeFormat` options object — e.g.
    `{"year":"numeric","month":"long"}`, `{"dateStyle":"long"}`

Defaults:

| Field | Default                             | Example                |
|-------|-------------------------------------|------------------------|
| Year  | `yyyy`                              | 2026                   |
| Month | `{"year":"numeric","month":"long"}` | April 2026             |
| Day   | `{"dateStyle":"long"}`              | Monday, April 27, 2026 |