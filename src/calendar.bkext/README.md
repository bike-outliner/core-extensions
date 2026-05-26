# Calendar

A notes-by-date workflow for Bike. Adds a `Today` button and a month-grid
calendar to the sidebar, and generates a `Calendar → Year → Month → Day`
outline structure on demand so you can keep dated notes without bookkeeping.

## Sidebar

**Today** — sidebar location. Jumps to today, creating the day row if it does
not yet exist, and places the cursor at its first child so you can start typing.

## Inspector

**Calendar** — inspector panel. A month grid; click a date to jump there. Header
controls (visible on hover): ‹ previous month, ◆ today, › next month. Selecting
any row inside the date hierarchy highlights the matching day in the grid.

## Outline structure

By default new dated notes are generated at the top of your outline:

    2026
    └─ April 2026
       └─ Monday, April 27, 2026
          └─ <your notes here>

Rows are created on demand — picking April 27 only creates the rows above it
that do not yet exist, and inserts them in chronological order among their
siblings. Existing rows are reused, never moved or duplicated.

**Location follows your structure.** When a date row is needed, the extension
first reuses the exact row if it exists, otherwise creates it under its parent
level (a day under its month, a month under its year). The top level (year, or
the coarsest level you've enabled) joins any existing rows of that level
wherever they already are, falling back to the document root. So to keep your
calendar somewhere specific — say under a `Calendar` row — just move it there
once, and new rows will be generated in that location from then on.

Each calendar row carries a stable `persistentId` of the form `YYYY/MM/DD`
(`YYYY/MM/00` for months, `YYYY/00/00` for years). This is what links the
calendar UI to outline rows, so you can freely edit the visible text of any
year, month, or day row without breaking anything.

## Commands

- `calendar:today` — jump to today, create the day row if missing, and place
  the cursor at its first child.
- `calendar:month` — pre-create every day in the current month.
- `calendar:year` — pre-create every day in the current year.

These generate every day of the period regardless of which levels are enabled;
the days are injected at whatever nesting Year/Month produce, and the cursor
lands in the nearest enabled container (month, year, or the document root).

Run them from the command palette, or bind keyboard shortcuts to them in
Bike's keybindings.

## Settings

Open Bike's Settings and choose the **Calendar** pane.

- **Show week numbers** — toggle the week-number column in the calendar grid.
- **Year / Month / Day** — the text for each level's rows. Put the date in a
  single `{ … }` span; everything outside the span is markdown.
  - The contents of `{ … }` are parsed as JSON: a valid object is used as
    [`Intl.DateTimeFormat` options](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat#using_options)
    (e.g. `{"dateStyle":"long"}`); otherwise the text inside is a
    [date-fns pattern](https://date-fns.org/docs/format) (e.g. `{ yyyy }`,
    `{ MMMM d }`).
  - Markdown outside the span formats the row: a leading `#`/`##` makes it a
    heading, `**…**` makes it bold. For example `# { yyyy }` renders the year as
    a heading and `**{"dateStyle":"long"}**` renders the day in bold.
- **Include checkbox** (Year and Month) — when unchecked, that level's row is
  not created. Day is always included. Uncheck both Year and Month for a flat
  list of days; uncheck only Month for years with days directly under them.

Defaults:

| Field | Default                             | Example                |
|-------|-------------------------------------|------------------------|
| Year  | `{ yyyy }`                          | 2026                   |
| Month | `{"year":"numeric","month":"long"}` | April 2026             |
| Day   | `{"dateStyle":"long"}`              | Monday, April 27, 2026 |
