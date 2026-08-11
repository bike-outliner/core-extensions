# Calendar

A notes-by-date workflow for Bike. Adds a `Today` button and a month-grid
calendar to the sidebar, and generates a `Calendar → Year → Month → Day`
outline structure on demand so you can keep dated notes without bookkeeping.
Each level above Day is optional, and an off-by-default Week level lets you keep
a `Year → Week → Day` outline instead.

## Sidebar

**Today** — sidebar location. Jumps to today, creating the day row if it does
not yet exist, and places the cursor at its first child so you can start typing.

## Inspector

**Calendar** — inspector panel. A month grid; click a date to jump there. Header
controls (visible on hover): ‹ previous month, ◆ today, › next month. Selecting
any row inside the date hierarchy highlights the matching day in the grid.

## Date marks

A dot under a day number means rows are dated to that day. "Dated" covers
**every attribute registered with a `date` type** — `@due` and `@start` ship with
Bike, and an extension registering its own date attribute shows up here with no
change to the calendar. The only exception is `@done`: a completion stamp is
history, not schedule, so it declares `metadata: { calendar: false }` and stays
off the grid. Any attribute can opt out the same way.

The dot is red when open `@due` work is overdue and orange when it's due
tomorrow. Only `@due` drives that tint — a `@start` in the past isn't a deadline
— and a day whose rows are all `@done` draws a neutral dot. Hover a dot to see
what's there ("2 Due, 1 Start").

Clicking a day filters the editor to that day's dated rows plus the day row (and
its subtree) if one exists. Hold ⌘ for only the dated rows, ⌥ for only the day
rows. Drag across days to filter a range. Dropping rows onto a day sets their
`@due` to it.

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

Each calendar row carries a stable `persistentId` of the form `YYYY/MM/DD`,
where `00` marks a slot the level doesn't use:

| Level | Id form       | Example      |
|-------|---------------|--------------|
| Year  | `YYYY/00/00`  | `2026/00/00` |
| Month | `YYYY/MM/00`  | `2026/04/00` |
| Week  | `YYYY/00/WW`  | `2026/00/18` |
| Day   | `YYYY/MM/DD`  | `2026/04/27` |

`WW` is the week's ordinal within the year of its **first** day. Week starts sit
seven days apart and a year's first one always falls in Jan 1–7, so ordinals run
1…53 without gaps and ids stay lexically chronological like the rest.

This id is what links the calendar UI to outline rows, so you can freely edit the
visible text of any row without breaking anything.

**Weeks stay whole.** A week is named for its first day, and its own parent is
resolved from that day — so a week straddling a month or year boundary lands
under the month/year it started in, with the following month's days still
beneath it, rather than splitting into two week rows.

## Commands

- `calendar:today` — jump to today, create the day row if missing, and place
  the cursor at its first child.
- `calendar:week` — pre-create every day in the current week.
- `calendar:month` — pre-create every day in the current month.
- `calendar:year` — pre-create every day in the current year.

These generate every day of the period regardless of which levels are enabled;
the days are injected at whatever nesting Year/Month/Week produce, and the cursor
lands in the nearest enabled container (week, month, year, or the document root).

Run them from the command palette, or bind keyboard shortcuts to them in
Bike's keybindings.

## Settings

Open Bike's Settings and choose the **Calendar** pane.

- **Show week numbers** — toggle the week-number column in the calendar grid.
- **Year / Month / Week / Day** — the text for each level's rows. Put the date in
  a `{ … }` span; everything outside the span is markdown. A field may hold more
  than one span — each is formatted on its own, which is how the Week default
  writes a number and a date.
  - The contents of `{ … }` are parsed as JSON: a valid object is used as
    [`Intl.DateTimeFormat` options](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat#using_options)
    (e.g. `{"dateStyle":"long"}`); otherwise the text inside is a
    [date-fns pattern](https://date-fns.org/docs/format) (e.g. `{ yyyy }`,
    `{ MMMM d }`).
  - Markdown outside the span formats the row: a leading `#`/`##` makes it a
    heading, `**…**` makes it bold. For example `# { yyyy }` renders the year as
    a heading and `**{"dateStyle":"long"}**` renders the day in bold.
- **Include checkbox** (Year, Month and Week) — when unchecked, that level's row
  is not created. Day is always included; Week defaults to off. Uncheck them all
  for a flat list of days; uncheck only Month for years with days directly under
  them; Week on with Month off is the `Year → Week → Day` shape.

Weeks begin on the system's first day of the week — the same normalized value
the calendar grid uses, so generated week rows and the grid's week-number column
always agree. There's no separate setting for it.

Defaults:

| Field | Default                             | Example                |
|-------|-------------------------------------|------------------------|
| Year  | `{ yyyy }`                          | 2026                   |
| Month | `{"year":"numeric","month":"long"}` | April 2026             |
| Week  | `Week { ww } ({ MMM d })`           | Week 18 (Apr 27)       |
| Day   | `{"dateStyle":"long"}`              | Monday, April 27, 2026 |

`ww` is the **local** week number: `bike.formatDate` resolves it against the
Mac's first day of the week, the same setting the week rows start on, so the
number always matches the week it names. `II` is the ISO week number and counts
weeks from Monday whatever the Mac says — on a Sunday-start Mac it labels each
row with the previous week's number, since the row is formatted from its first
day and ISO calls that Sunday the last day of the week before.
