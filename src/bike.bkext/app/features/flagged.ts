import { BadgeEnvironment, Color, Image, SymbolConfiguration } from 'bike/app'

// The `flagged` feature: an attribute marking a row for attention in one of
// seven colors, and a badge drawing one flag glyph tinted by that value.

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

  bike.badge('flagged', {
    where: '.@flagged',
    inputs: { flagged: '@flagged', done: '@done' },
    // A completed row's flag drops its color and fades to the same alpha the
    // due badge fades its label to — the attention it was asking for has been
    // paid; only open rows fly a colored flag.
    render: (values, env) =>
      Image.fromSymbol(
        new SymbolConfiguration('flag.fill')
          .withHierarchicalColor(values['done'] != null ? env.color.alphaSet(0.3) : tint(values['flagged'] ?? '', env))
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
