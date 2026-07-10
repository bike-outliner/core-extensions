import { Image, SymbolConfiguration } from 'bike/app'

// The whole "priority" feature in one app-context file: a value-aware row
// badge whose click opens a card of choices (Priority 1/2/3 · Remove Priority).
// The card's set/remove actions are declarative — the host applies them to the
// clicked row in one undo step.

export function registerPriority() {
  // `where` selects rows with a `priority` attribute; `inputs` defaults to
  // ['priority'], so render reads values.priority (the memo key).
  bike.badge('priority', {
    where: '.@priority',
    render: (values, env) => {
      const value = values['priority'] ?? ''
      const n = clampPriority(value)
      return {
        image: Image.fromSymbol(
          new SymbolConfiguration(`${n}.square`).withHierarchicalColor(env.color.alphaSet(0.6)).withFont(env.font)
        ),
        actions: [
          { title: 'Priority 1', role: 'set', value: '1', isCurrent: value === '1' },
          { title: 'Priority 2', role: 'set', value: '2', isCurrent: value === '2' },
          { title: 'Priority 3', role: 'set', value: '3', isCurrent: value === '3' },
          { role: 'separator' },
          { title: 'Remove Priority', role: 'remove' },
        ],
      }
    },
  })
}

function clampPriority(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(3, Math.max(1, n))
}
