import { registerProgress } from './progress'
import { registerDefaultBadges } from './default'

export function registerBadges() {
  registerProgress()
  registerDefaultBadges() // last for `observeAttributes`
}
