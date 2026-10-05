import { BadgeEnvironment, Color, Image, SymbolConfiguration } from 'bike/app'
import {
  clearAttributeOnSelection,
  filterCommand,
  setAttributeOnSelection,
  toggleAttributeOnSelection,
} from './helpers'

// The `flagged` feature: a seven-color flag attribute, a tinted flag badge and
// commands.

export const FLAG_COLORS = ['orange', 'red', 'purple', 'blue', 'yellow', 'green', 'gray'] as const
export type FlagColor = (typeof FLAG_COLORS)[number]

const COLORS: Record<FlagColor, () => Color> = {
  orange: () => Color.systemOrange(),
  red: () => Color.systemRed(),
  purple: () => Color.systemPurple(),
  blue: () => Color.systemBlue(),
  yellow: () => Color.systemYellow(),
  green: () => Color.systemGreen(),
  gray: () => Color.systemGray(),
}

export function registerFlagged() {
  const names: Record<FlagColor, string> = {
    orange: bike.localize('Orange'),
    red: bike.localize('Red'),
    purple: bike.localize('Purple'),
    blue: bike.localize('Blue'),
    yellow: bike.localize('Yellow'),
    green: bike.localize('Green'),
    gray: bike.localize('Gray'),
  }
  const setLabel = bike.localize('Set Flagged')

  bike.attribute('flagged', {
    title: bike.localize('Flagged'),
    type: 'choice',
    choices: FLAG_COLORS.map((value) => ({ name: names[value], value })),
    emptyLabel: bike.localize('Flagged'),
    description: bike.localize('Marks the row for attention, in one of seven colors.'),
    defaultBadge: false,
  })

  bike.commands.addCommands({
    commands: {
      // Raises a valueless flag (drawn red), or lowers it when all rows have one.
      'flagged:toggle': toggleAttributeOnSelection('flagged', '', bike.localize('Toggle Flagged')),
      // One setter per color; these set, they don't toggle. Literal ids so the
      // build can extract their titles.
      'flagged:orange': setAttributeOnSelection('flagged', 'orange', setLabel),
      'flagged:red': setAttributeOnSelection('flagged', 'red', setLabel),
      'flagged:purple': setAttributeOnSelection('flagged', 'purple', setLabel),
      'flagged:blue': setAttributeOnSelection('flagged', 'blue', setLabel),
      'flagged:yellow': setAttributeOnSelection('flagged', 'yellow', setLabel),
      'flagged:green': setAttributeOnSelection('flagged', 'green', setLabel),
      'flagged:gray': setAttributeOnSelection('flagged', 'gray', setLabel),
      'flagged:remove': clearAttributeOnSelection('flagged', bike.localize('Remove Flagged')),
      'flagged:filter': filterCommand({
        path: '//(@flagged and open())',
        label: bike.localize('Flagged'),
        emptyTitle: bike.localize('No Flagged Items'),
        emptyMessage: bike.localize('There are no flagged items that have not been completed.'),
      }),
    },
  })

  bike.badge('flagged', {
    where: '.@flagged',
    inputs: { flagged: '@flagged', closed: 'closed()' },
    // Closed rows drop the color and fade, like the due badge.
    render: (values, env) =>
      Image.fromSymbol(
        new SymbolConfiguration('flag.fill')
          .withHierarchicalColor(values['closed'] === 'true' ? env.color.alphaSet(0.3) : tint(values['flagged'] ?? '', env))
          .withFont(env.font)
      ),
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'flagged' }, 'flagged'),
  })
}

function tint(value: string, env: BadgeEnvironment): Color {
  if (value === '') return Color.systemRed()
  return value in COLORS ? COLORS[value as FlagColor]() : env.color
}
