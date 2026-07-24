import { parseDurationAttribute } from './dates'

export function registerEstimate() {
  bike.attribute('estimate', {
    title: 'Estimate',
    type: 'duration',
    description: 'Estimated effort as a duration: 30m, 2h, 1d.',
    standardValues: ['15m', '30m', '1h', '2h', '1d'].map((d) => ({ name: d, value: d })),
    parse: (text) => parseDurationAttribute(text),
  })
}
