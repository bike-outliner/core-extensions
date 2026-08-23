import { BadgeEnvironment, Color, CommandDefinition, Image, SymbolConfiguration } from 'bike/app'
import {
  clearAttributeOnSelection,
  filterCommand,
  setAttributeOnSelection,
  toggleAttributeOnSelection,
} from './helpers'

// The `flagged` feature: an attribute marking a row for attention in one of
// seven colors, a badge drawing one flag glyph tinted by that value, and ten
// commands that raise, recolor, lower, or filter it.
//
// As with priority, the commands are the only KEYBOARD path to flagging a row:
// the badge renders on `.@flagged`, so it isn't there to click until the row
// already carries the attribute.

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
    // The badge below presents this attribute — opt out of the catch-all.
    defaultBadge: false,
  })

  bike.commands.addCommands({
    commands: {
      // The binary act, which is how most rows get flagged: raise a VALUELESS
      // flag (meaningful on its own — `emptyLabel`, and `tint` flies it red),
      // or lower it when every selected row already has one.
      'flagged:toggle': toggleAttributeOnSelection('flagged', '', 'Toggle Flagged'),
      // One direct setter per color, generated from the same closed set the
      // attribute's choices come from — `priority:1/2/3`, seven wide. Like
      // those (and like the attribute menu's radios) these SET, they don't
      // toggle: `flagged:red` on an already-red row leaves it red.
      ...Object.fromEntries(
        FLAG_COLORS.map((color) => [`flagged:${color}`, setAttributeOnSelection('flagged', color, 'Set Flagged')])
      ) as Record<string, CommandDefinition>,
      'flagged:clear': clearAttributeOnSelection('flagged', 'Clear Flagged'),
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
    // A completed row's flag drops its color and fades to the same alpha the
    // due badge fades its label to — the attention it was asking for has been
    // paid; only open rows fly a colored flag.
    render: (values, env) =>
      Image.fromSymbol(
        new SymbolConfiguration('flag.fill')
          .withHierarchicalColor(values['closed'] === 'true' ? env.color.alphaSet(0.3) : tint(values['flagged'] ?? '', env))
          .withFont(env.font)
      ),
    // The built-in attribute menu for @flagged, at this badge's glyph.
    onClick: ({ editor, row }) => editor.showAttributeMenu({ row, anchor: 'flagged' }, 'flagged'),
  })
}

function tint(value: string, env: BadgeEnvironment): Color {
  if (value === '') return Color.systemRed()
  return value in COLORS ? COLORS[value as FlagColor]() : env.color
}
