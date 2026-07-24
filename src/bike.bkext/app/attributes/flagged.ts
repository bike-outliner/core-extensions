export function registerFlagged() {
  bike.attribute('flagged', {
    title: 'Flagged',
    type: 'flag',
    emptyLabel: 'Flagged',
    description: 'Marks the row for attention — valueless.',
  })
}
