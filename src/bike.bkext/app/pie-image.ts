import { BadgeEnvironment, Color, Image, Path, Point, Rect, Shape } from 'bike/app'

// The task rollup's fraction glyph: the `done/total` fraction drawn as a
// filled wedge on a transparent background, ringed by a border that matches
// every other drawn badge on the row. Sized to the shared badge rect and
// tinted from the outline's base text color so it reads as chrome like the
// fraction glyph.
export function pieImage(fraction: number, env: BadgeEnvironment): Image {
  const { wedge, border } = pieParts(fraction, env)
  return Image.fromShape(wedge).withComposite(Image.fromShape(border))
}

// The wedge + border ring. The border composites LAST so it stays crisp over
// the wedge rather than being half-covered by it.
function pieParts(fraction: number, env: BadgeEnvironment): { wedge: Shape; border: Shape } {
  const side = env.badgeMetrics.side
  const f = Math.max(0, Math.min(1, fraction))
  const rect = new Rect(0, 0, side, side)
  const center = new Point(side / 2, side / 2)
  const radius = side / 2
  const sw = env.badgeMetrics.strokeWidth
  // The done circle sits 1pt inside the border's inner edge, so a complete pie
  // reads as: border ring, a 1pt transparent gap, then a filled circle in the
  // border color. (Border stroke is centered on `radius`, inner edge = radius − sw/2.)
  const wedgeRadius = radius - sw / 2 - 1

  const wedgePath = new Path()
  // Start at 12 o'clock and sweep CLOCKWISE by the completed fraction. This
  // render space is y-up (angles increase counter-clockwise, +y is screen-up),
  // so noon is +π/2 and a NEGATIVE relative-arc delta sweeps clockwise on screen.
  const start = Math.PI / 2
  wedgePath.moveTo(center)
  wedgePath.addRelativeArc(center, wedgeRadius, start, -f * 2 * Math.PI)
  wedgePath.closeSubpath()
  // The badge draws by rendering each shape to its OWN image sized to the path's
  // bounding box, then `withComposite` centers those images together. A partial
  // wedge's bbox is only the swept sliver (offset from the circle), so centering
  // shifts it off the border — a small fraction renders like an empty/full disc.
  // Pin the wedge's bbox to the full badge rect so it shares the border's canvas
  // center and compositing aligns them exactly. Empty `moveTo` subpaths get
  // dropped, so anchor with zero-length line segments at the circle's four
  // cardinal points — they sit under the border ring and add no visible fill.
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
  // Done fill at twice the border's opacity, so the wedge reads a bit darker
  // than the ring around it.
  wedge.fill.color = env.color.alphaSet(0.5)
  wedge.stroke.color = Color.clear()

  // A border ring matching the default drawn-badge border (`env.color` at 0.3,
  // `badgeMetrics.strokeWidth`) — the same color as the done circle.
  const border = new Shape(Path.ellipseInRect(rect))
  border.fill.color = Color.clear()
  border.stroke.color = env.color.alphaSet(0.3)
  border.line.width = sw

  return { wedge, border }
}
