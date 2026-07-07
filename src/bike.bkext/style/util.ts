import {
  Color,
  StyleContext,
  Font,
  FontAttributes,
  Image,
  Insets,
  Path,
  Point,
  Rect,
  Shape,
  SymbolConfiguration,
} from 'bike/style'

// Geometry constants
const BASE_FONT_SIZE = 14
const INDENT_MULTIPLIER = 22
const VIEWPORT_PADDING_BASE = 10
const ROW_TEXT_PADDING_MULTIPLIER = 5
const HANDLE_WIDTH_MULTIPLIER = 6
const HANDLE_HEIGHT_MULTIPLIER = 10
const OUTLINE_FOCUS_ALPHA = 0.0
const TEXT_FOCUS_ALPHA = 0.15
const BOTTOM_VIEWPORT_FRACTION = 0.5

// Font-scaling + top-margin tiers, selected by how many *unscaled* row widths
// fit across the viewport (fillRatio = viewportSize.width / baseRowWidth).
// Font scale and top padding step together at these breakpoints, so the wrap
// width is constant while resizing inside a tier — a re-wrap happens only once,
// when a boundary is crossed. Grow boundaries sit at scale * 1.6 so each tier
// reaches ~golden fill (≈0.618 of the viewport) at its low edge.
const FONT_SCALE_TIERS = [
  { minFillRatio: 4.4, scale: 2.75, paddingInLineHeights: 8 },
  { minFillRatio: 4.0, scale: 2.5, paddingInLineHeights: 4 },
  { minFillRatio: 3.6, scale: 2.25, paddingInLineHeights: 4 },
  { minFillRatio: 3.2, scale: 2.0, paddingInLineHeights: 4 },
  { minFillRatio: 2.8, scale: 1.75, paddingInLineHeights: 2 },
  { minFillRatio: 2.4, scale: 1.5, paddingInLineHeights: 2 },
  { minFillRatio: 2.0, scale: 1.25, paddingInLineHeights: 1 },
  { minFillRatio: 1.6, scale: 1.0, paddingInLineHeights: 1 },
  { minFillRatio: 0.5, scale: 1.0, paddingInLineHeights: 0 },
  { minFillRatio: 0.4, scale: 0.9, paddingInLineHeights: 0 },
  { minFillRatio: 0.0, scale: 0.8, paddingInLineHeights: 0 },
]

/**
 * This function computes/caches values derived from `StyleContext` state. Bike
 * styles should use `context.settings` and `context.theme` values directly
 * where appropriate, but this function is useful for values that need
 * computation or caching.
 *
 * For example, consider the case where the editor is wrapping text to a
 * specific column (`lineWidth`) while displaying in a large viewport. In
 * that case we can end up with a tiny column of text in the center of a large
 * viewport. This function detects that case and dynamically scales the user's
 * choosen font to better fill the viewport, while maintaining the user's
 * `lineWidth` setting.
 *
 * This function is not a required part of an editor style, but I think it's a
 * useful pattern, especially for more complex editor styles that try to work
 * under a variety of conditions.
 *
 * @param context
 * @returns The computed values derived from the context
 */
export function computeValues(context: StyleContext): {
  font: Font
  fontAttributes: FontAttributes
  indent: number
  lineHeight: number
  uiScale: number
  rowPadding: Insets
  rowTextMargin: Insets
  rowTextPadding: Insets
  viewportPadding: Insets
  handleImage: Image
  handleUnloadedImage: Image
  outlineFocusAlpha: number
  textFocusAlpha: number
} {
  if (context.userCache.has('values')) {
    return context.userCache.get('values')
  }

  let font = context.settings.font
  let viewportSize = context.viewportSize
  let viewportContentInsets = context.viewportContentInsets
  let visibleViewportHeight = viewportSize.height - viewportContentInsets.top - viewportContentInsets.bottom
  let typewriterMode = context.settings.typewriterMode
  let lineWidth = context.settings.lineWidth ?? Number.MAX_SAFE_INTEGER
  let geometry = computeGeometryForFont(font, context)

  if (lineWidth == 0 || lineWidth == Number.MAX_SAFE_INTEGER) {
    if (typewriterMode) {
      geometry.viewportPadding.top = visibleViewportHeight * typewriterMode
    }
  } else {
    let xWidth = geometry.fontAttributes.xWidth
    let textWidth = Math.ceil(xWidth * lineWidth)
    // Row width of the user's UNSCALED font. Stateless anchor: never derived
    // from the scaled result, so there is no feedback loop with rowWrapWidth.
    let baseRowWidth =
      textWidth +
      geometry.rowPadding.width +
      Math.max(geometry.rowTextMargin.width, geometry.rowTextPadding.width)
    let fillRatio = viewportSize.width / baseRowWidth

    // Coarse, stateless step function of viewport width. Font scale and top
    // margin both come from this single tier, so they jump together and stay
    // constant (no re-wrap) while dragging inside a tier.
    let tier = FONT_SCALE_TIERS[FONT_SCALE_TIERS.length - 1]
    for (const candidate of FONT_SCALE_TIERS) {
      if (fillRatio >= candidate.minFillRatio) {
        tier = candidate
        break
      }
    }

    if (context.settings.allowFontScaling == true && tier.scale != 1) {
      // Snap to a whole point once per tier. tier.scale is constant across the
      // whole tier, so the rounded size is constant too: no sub-pixel flicker
      // and no re-wrap while resizing within a tier.
      let scaledPointSize = Math.round(geometry.fontAttributes.pointSize * tier.scale)
      font = font.withPointSize(scaledPointSize)
      geometry = computeGeometryForFont(font, context)
    }

    let rowWrapWidth = geometry.rowWrapWidth

    if (rowWrapWidth) {
      let availibleWidth = viewportSize.width - rowWrapWidth
      let leftPadding = Math.floor(availibleWidth / 2)
      let rightPadding = Math.ceil(availibleWidth / 2)
      geometry.viewportPadding.left = Math.max(leftPadding, geometry.viewportPadding.left)
      geometry.viewportPadding.right = Math.max(rightPadding, geometry.viewportPadding.right)
    }

    if (typewriterMode) {
      geometry.viewportPadding.top = visibleViewportHeight * typewriterMode
    } else if (tier.paddingInLineHeights > 0) {
      // Tiers only *raise* the top margin. When paddingInLineHeights is 0 the
      // default VIEWPORT_PADDING_BASE * uiScale set in computeGeometryForFont is
      // left in place, so the minimum top margin matches the pre-tier behavior.
      let lineHeight = geometry.fontAttributes.pointSize * context.settings.lineHeightMultiple
      geometry.viewportPadding.top = lineHeight * tier.paddingInLineHeights
    }
  }

  if (context.isFullWindow) {
    let minHorizontalPadding = viewportContentInsets.top
    geometry.viewportPadding.left = Math.max(geometry.viewportPadding.left, minHorizontalPadding)
    geometry.viewportPadding.right = Math.max(geometry.viewportPadding.right, minHorizontalPadding)
  }

  let uiScale = geometry.uiScale
  let handleWidth = Math.max(1, HANDLE_WIDTH_MULTIPLIER * uiScale)
  let handleHeight = Math.max(1, HANDLE_HEIGHT_MULTIPLIER * uiScale)
  let handleImage = buildHandleImage(handleWidth, handleHeight, context.theme.colors.handle)
  let handleUnloadedImage = buildHandleImage(handleWidth, handleHeight, context.theme.colors.handleUnloaded)

  // A single text line's height (descender is negative), with headroom so it
  // always exceeds a real line fragment: capping a line anchor with
  // `.min(lineHeight)` leaves text lines untouched while taming lines made
  // tall by inline images.
  let lineHeight =
    (geometry.fontAttributes.ascender - geometry.fontAttributes.descender) *
    context.settings.lineHeightMultiple *
    1.3

  let values = {
    font: font,
    fontAttributes: geometry.fontAttributes,
    indent: geometry.indent,
    lineHeight: lineHeight,
    uiScale: uiScale,
    rowPadding: geometry.rowPadding,
    rowTextMargin: geometry.rowTextMargin,
    rowTextPadding: geometry.rowTextPadding,
    viewportPadding: geometry.viewportPadding,
    handleImage: handleImage,
    handleUnloadedImage: handleUnloadedImage,
    outlineFocusAlpha: OUTLINE_FOCUS_ALPHA,
    textFocusAlpha: TEXT_FOCUS_ALPHA,
  }

  context.userCache.set('values', values)

  return values
}

function computeGeometryForFont(
  font: Font,
  context: StyleContext,
): {
  uiScale: number
  indent: number
  rowPadding: Insets
  rowTextMargin: Insets
  rowTextPadding: Insets
  rowWrapWidth: number
  viewportPadding: Insets
  fontAttributes: FontAttributes
} {
  let viewportSize = context.viewportSize
  let viewportContentInsets = context.viewportContentInsets
  let visibleViewportHeight = viewportSize.height - viewportContentInsets.top - viewportContentInsets.bottom
  let fontAttributes = font.resolve(context)
  let pointSize = fontAttributes.pointSize
  let uiScale = pointSize / BASE_FONT_SIZE
  let indent = INDENT_MULTIPLIER * uiScale
  let rowPaddingBase = context.settings.rowSpacingMultiple * pointSize * uiScale
  let rowTextPaddingBase = ROW_TEXT_PADDING_MULTIPLIER * uiScale
  let rowTextMarginBase = rowPaddingBase / 2
  let rowPadding = new Insets(rowPaddingBase, rowPaddingBase, rowPaddingBase, indent)

  let rowTextMargin = new Insets(rowTextMarginBase, 0, rowTextMarginBase, 0)
  let rowTextPadding = new Insets(0, rowTextPaddingBase, 0, rowTextPaddingBase)
  // macOS balances the leading handle indent with trailing whitespace; iOS
  // keeps that horizontal space for text.
  let viewportTrailingPadding =
    context.os === 'iOS'
      ? VIEWPORT_PADDING_BASE * uiScale
      : VIEWPORT_PADDING_BASE * uiScale + indent
  let viewportPadding = new Insets(
    VIEWPORT_PADDING_BASE * uiScale,
    viewportTrailingPadding,
    visibleViewportHeight * BOTTOM_VIEWPORT_FRACTION,
    VIEWPORT_PADDING_BASE * uiScale,
  )

  let lineWidth = context.settings.lineWidth ?? Number.MAX_SAFE_INTEGER
  let rowWrapWidth = Number.MAX_SAFE_INTEGER

  if (lineWidth > 0 && lineWidth < Number.MAX_SAFE_INTEGER) {
    let textWidth = Math.ceil(fontAttributes.xWidth * lineWidth)
    rowWrapWidth =
      textWidth + rowPadding.width + Math.max(rowTextMargin.width, rowTextPadding.width)
  }

  return {
    uiScale: uiScale,
    indent: indent,
    rowPadding: rowPadding,
    rowTextMargin: rowTextMargin,
    rowTextPadding: rowTextPadding,
    rowWrapWidth: rowWrapWidth,
    viewportPadding: viewportPadding,
    fontAttributes: fontAttributes,
  }
}

function buildHandleImage(width: number, height: number, color: Color): Image {
  let path = new Path()
  path.moveTo(new Point(0, 0))
  path.addLineTo(new Point(0, height))
  path.addLineTo(new Point(width, height / 2))
  path.closeSubpath()
  let shape = new Shape(path)
  shape.fill.color = color
  shape.line.width = 0
  return Image.fromShape(shape)
}

export function symbolImage(name: string, color: Color, font: Font): Image {
  let symbol = new SymbolConfiguration(name).withHierarchicalColor(color).withFont(font)
  return Image.fromSymbol(symbol)
}

export function buildCircleImage(diameter: number, color: Color): Image {
  let shape = new Shape(Path.elipseInRect(new Rect(0, 0, diameter, diameter)))
  shape.fill.color = color
  shape.line.width = 0
  return Image.fromShape(shape)
}
