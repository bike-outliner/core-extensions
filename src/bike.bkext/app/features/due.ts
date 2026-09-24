import { Color, Image, Text } from 'bike/app'
// Shared with the calendar; date-marks.ts is import-free so esbuild can inline it.
import { dueUrgency } from '../../../calendar.bkext/dom/date-marks'
import {
  clearAttributeOnSelection,
  filterCommand,
  pickAttributeForSelection,
  setAttributeOnSelection,
} from './helpers'

// The `due` feature. A value is `YYYY-MM-DD` (local), a timed ISO-8601
// timestamp, or empty for "soon". The badge lives here so `@due` shows
// without calendar.bkext.

export function registerDue() {
  bike.attribute('due', {
    title: 'Due',
    type: 'date',
    emptyLabel: 'Soon',
    description: 'When the row is due — a calendar day, a timestamp, or valueless for "soon".',
    defaultBadge: false,
    suggestions: () => [{ name: 'Soon', value: '', menu: true }],
  })

  bike.commands.addCommands({
    commands: {
      'due:set': pickAttributeForSelection('due'),
      // Date-only. Thunks, or "today" would be pinned to launch day.
      'due:today': setAttributeOnSelection('due', () => dayStamp(0), 'Set Due'),
      'due:tomorrow': setAttributeOnSelection('due', () => dayStamp(1), 'Set Due'),
      'due:soon': setAttributeOnSelection('due', '', 'Set Due'),
      'due:clear': clearAttributeOnSelection('due', 'Clear Due'),
      'due:filter': filterCommand({
        path: '//(@due and open())',
        label: 'Due',
        emptyTitle: 'No Due Items',
        emptyMessage: 'There are no due items that have not been completed.',
      }),
    },
  })

  bike.badge('due', {
    where: '.@due',
    inputs: { due: '@due', closed: 'closed()' },
    // Relative labels roll over at midnight.
    tick: 60,
    render: (values, env) => {
      const raw = values['due']
      if (raw == null) return null
      // Undefined for "soon" and junk.
      const due = bike.decodeValue('date', raw)

      const now = new Date((env.now ?? 0) * 1000)
      const done = values['closed'] === 'true'
      // Open items: red today, orange tomorrow or "soon", filled red once
      // overdue. Closed rows keep the inherited color.
      const urgency = done ? 'later' : !due ? 'soon' : dueUrgency(due, now)
      const color =
        urgency === 'overdue' || urgency === 'urgent'
          ? Color.systemRed()
          : urgency === 'soon'
            ? Color.systemOrange()
            : env.color
      const overdue = urgency === 'overdue'
      const bm = env.badgeMetrics
      const label = raw === '' ? 'Soon' : env.formatAttribute('due', raw)
      const textColor = overdue ? env.theme.colors.background : color.alphaSet(done ? 0.3 : 0.8)
      return Image.fromText(new Text(label, env.font.withPointSize(bm.fontSize), textColor)).withBackground({
        fill: overdue ? color : undefined,
        stroke: overdue ? color : color.alphaSet(0.3),
        strokeWidth: bm.strokeWidth,
        cornerRadius: bm.cornerRadius,
        padding: bm.padding,
      })
    },
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'due' }, 'due'),
  })
}

// Date-only wire form for the local day `offset` days from now.
function dayStamp(offset: number): string {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return bike.encodeValue('date', day)!
}
