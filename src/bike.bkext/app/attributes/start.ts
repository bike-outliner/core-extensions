import { dateSuggestions, parseDateAttribute } from './dates'

export function registerStart() {
  bike.attribute('start', {
    title: 'Start',
    type: 'date',
    description: 'When work on the row starts — same date shapes as due.',
    values: () => dateSuggestions(),
    parse: (text) => parseDateAttribute(text),
  })
}
