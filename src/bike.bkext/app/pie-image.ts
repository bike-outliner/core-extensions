import { BadgeEnvironment, Color, Image, Path, Point, Rect, Shape } from 'bike/app'

// The task rollup's fraction as a pie wedge inside a standard badge border.
export function pieImage(fraction: number, env: BadgeEnvironment): Image {
  const { wedge, border } = pieParts(fraction, env)
  return Image.fromShape(wedge).withComposite(Image.fromShape(border))
}

// The border composites last so it stays crisp over the wedge.
function pieParts(fraction: number, env: BadgeEnvironment): { wedge: Shape; border: Shape } {
  const side = env.badgeMetrics.side
  const f = Math.max(0, Math.min(1, fraction))
  const rect = new Rect(0, 0, side, side)
  const center = new Point(side / 2, side / 2)
  const radius = side / 2
  const sw = env.badgeMetrics.strokeWidth
  // 1pt gap inside the border's inner edge (radius − sw/2).
  const wedgeRadius = radius - sw / 2 - 1

  const wedgePath = new Path()
  // Clockwise from 12 o'clock; the space is y-up, so a negative delta.
  const start = Math.PI / 2
  wedgePath.moveTo(center)
  wedgePath.addRelativeArc(center, wedgeRadius, start, -f * 2 * Math.PI)
  wedgePath.closeSubpath()
  // Each shape renders at its own bbox and `withComposite` centers them, so a
  // partial wedge would shift. Pin its bbox to the full rect with tiny segments
  // at the cardinal points (empty `moveTo` subpaths are dropped).
  const eps = 0.01
  for (const [x, y, dx, dy] of [
    [side / 2, 0, 0, eps],
    [side, side / 2, -eps, 0],
    [side / 2, side, 0, -eps],
    [0, side / 2, eps, 0],
  ]) {
    wedgePath.moveTo(new Point(x, y))
    wedgePath.addLineTo(new Point(x + dx, y + dy))
  }
  const wedge = new Shape(wedgePath)
  wedge.fill.color = env.color.alphaSet(0.5)
  wedge.stroke.color = Color.clear()

  const border = new Shape(Path.ellipseInRect(rect))
  border.fill.color = Color.clear()
  border.stroke.color = env.color.alphaSet(0.3)
  border.line.width = sw

  return { wedge, border }
}
