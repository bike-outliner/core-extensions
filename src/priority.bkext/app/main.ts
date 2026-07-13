import { AppExtensionContext, Image, SymbolConfiguration } from 'bike/app'

// The whole "priority" feature in one app-context file: a value-aware row
// badge whose click opens a card — a radio group (Priority 1/2/3), a custom
// field, and Remove. The radio group and the field commit through the same
// onChange, so choosing a preset and typing a custom value are one code path.

export async function activate(context: AppExtensionContext) {
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
        items: [
          {
            kind: 'radio',
            id: 'priority',
            options: [
              { value: '1', label: 'Priority 1', filter: '//@priority = 1' },
              { value: '2', label: 'Priority 2', filter: '//@priority = 2' },
              { value: '3', label: 'Priority 3', filter: '//@priority = 3' },
            ],
            value,
          },
          { kind: 'separator' },
          { kind: 'field', id: 'priority', label: 'Priority', value, placeholder: 'custom', filter: '//@priority' },
          { kind: 'separator' },
          { kind: 'action', id: 'remove', title: 'Remove Priority' },
        ],
      }
    },
    onAction: (id, { row }) => {
      if (id !== 'remove') return
      row.outline.transaction({ label: 'Remove Priority' }, () => {
        row.removeAttribute('priority')
      })
    },
    onChange: (id, value, { row }) => {
      row.outline.transaction({ label: 'Set Priority' }, () => {
        row.setAttribute('priority', value)
      })
    },
  })
}

function clampPriority(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(3, Math.max(1, n))
}
