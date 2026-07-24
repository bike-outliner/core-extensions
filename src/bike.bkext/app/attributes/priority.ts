export function registerPriority() {
  bike.attribute('priority', {
    title: 'Priority',
    type: 'number',
    strict: true,
    description: 'Importance from 1 (highest) to 3 (lowest).',
    standardValues: [1, 2, 3].map((n) => ({ name: String(n), value: String(n) })),
    shortcuts: () => [1, 2, 3].map((n) => ({ name: `Priority ${n}`, value: String(n) })),
  })
}
