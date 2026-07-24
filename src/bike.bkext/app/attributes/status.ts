export function registerStatus() {
  bike.attribute('status', {
    title: 'Status',
    type: 'string',
    strict: true,
    description: 'Workflow state: todo, doing, or review.',
    standardValues: [
      { name: 'todo', value: 'todo' },
      { name: 'doing', value: 'doing' },
      { name: 'review', value: 'review' },
    ],
  })
}
