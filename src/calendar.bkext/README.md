# Calendar

This is a notes calendar for Bike. It generates an outline structure as needed
for dates requested.

For non-note items (events, reminders) you could come up with some conventions,
but I think Bike isn't the best tool for that. Better to use the system calendar
database for those items.

## Custom Date Formats

The text used for year, month, day, and time row headings can be customized
using `defaults write` in Terminal. Each setting is a JSON dictionary of
`Intl.DateTimeFormat` options.

The defaults domain depends on which version of Bike you use:

- **Direct purchase:** `com.hogbaysoftware.Bike`
- **Setapp:** `com.hogbaysoftware.Bike-setapp`

### Available settings

| Key | Default heading | Description |
|---|---|---|
| `bike.ext.calendar.yearNameFormat` | `2026` | Year row text |
| `bike.ext.calendar.monthNameFormat` | `April, 2026` | Month row text |
| `bike.ext.calendar.dayNameFormat` | `April 09, 2026` | Day row text |
| `bike.ext.calendar.timeNameFormat` | `8:01 AM` | Time row text |

### Format types

Each setting accepts either:

- **A JSON object** — passed to `Intl.DateTimeFormat` for locale-aware
  formatting. See [DateTimeFormat options](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat#options)
  for all available properties.
- **A string** — used as a pattern with placeholders: `YYYY` (4-digit year),
  `MM` (2-digit month), `DD` (2-digit day), `hh` (2-digit hour, 24h),
  `mm` (2-digit minute).

### Examples

Locale-aware formatting (uses your macOS Language & Region settings):

    defaults write com.hogbaysoftware.Bike bike.ext.calendar.yearNameFormat '{ "year": "numeric", "era": "short" }'
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.monthNameFormat '{ "year": "numeric", "month": "long" }'
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.dayNameFormat '{ "dateStyle": "long" }'
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.timeNameFormat '{ "hour": "2-digit", "minute": "2-digit", "hour12": false }'

Fixed ISO-style formatting:

    defaults write com.hogbaysoftware.Bike bike.ext.calendar.yearNameFormat -string "YYYY"
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.monthNameFormat -string "YYYY-MM"
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.dayNameFormat -string "YYYY-MM-DD"
    defaults write com.hogbaysoftware.Bike bike.ext.calendar.timeNameFormat -string "hh:mm"

Remove a custom format to revert to the default:

    defaults delete com.hogbaysoftware.Bike bike.ext.calendar.dayNameFormat