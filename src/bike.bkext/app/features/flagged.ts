import { BadgeEnvironment, Color, CommandDefinition, Image, SymbolConfiguration } from 'bike/app'
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
  bike.attribute('flagged', {
    title: 'Flagged',
    type: 'choice',
    choices: FLAG_COLORS.map((name) => ({ name: name[0].toUpperCase() + name.slice(1), value: name })),
    emptyLabel: 'Flagged',
    description: 'Marks the row for attention, in one of seven colors.',
    defaultBadge: false,
  })

  bike.commands.addCommands({
    commands: {
      // Raises a valueless flag (drawn red), or lowers it when all rows have one.
      'flagged:toggle': toggleAttributeOnSelection('flagged', '', 'Toggle Flagged'),
      // One setter per color; these set, they don't toggle.
      ...Object.fromEntries(
        FLAG_COLORS.map((color) => [`flagged:${color}`, setAttributeOnSelection('flagged', color, 'Set Flagged')])
      ) as Record<string, CommandDefinition>,
      'flagged:remove': clearAttributeOnSelection('flagged', 'Remove Flagged'),
      'flagged:filter': filterCommand({
        path: '//(@flagged and open())',
        label: 'Flagged',
        emptyTitle: 'No Flagged Items',
        emptyMessage: 'There are no flagged items that have not been completed.',
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
