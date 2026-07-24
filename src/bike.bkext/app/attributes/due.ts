import { addDays, dayKey, dateSuggestions, parseDateAttribute } from './dates'

// The due SHAPE lives here so it's defined whether or not calendar.bkext
// is enabled; calendar presents it (badge, commands, calendar inspector).
export function registerDue() {
  bike.attribute('due', {
    title: 'Due',
    type: 'date',
    emptyLabel: 'Soon',
    description: 'When the row is due — a calendar day, a timestamp, or valueless for "soon".',
    // calendar.bkext presents due itself — opt out of the default badge.
    defaultBadge: false,
    shortcuts: () => {
      const now = new Date()
      return [
        { name: 'Due Soon', value: '' },
        { name: 'Due Today', value: dayKey(now) },
        { name: 'Due Tomorrow', value: dayKey(addDays(now, 1)) },
      ]
    },
    values: () => dateSuggestions(),
    parse: (text) => {
      // The valueless due: `@due:soon` and `^soon` commit the empty value.
      if (text.trim().toLowerCase() === 'soon') return { value: '', label: 'Soon' }
      return parseDateAttribute(text)
    },
  })
}
