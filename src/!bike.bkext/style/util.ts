import {
  Color,
  StyleContext,
  Font,
  FontAttributes,
  Image,
  Insets,
  Path,
  Point,
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
const GOLDEN_RATIO = 1.618
const OUTLINE_FOCUS_ALPHA = 0.0
const TEXT_FOCUS_ALPHA = 0.15
const BOTTOM_VIEWPORT_FRACTION = 0.5

// Vertical padding breakpoints: when viewport has this many lineHeights of
// extra width beyond the row wrap width, apply the corresponding top padding
const VERTICAL_PADDING_TIERS = [
  { extraWidthInLineHeights: 64, paddingInLineHeights: 8 },
  { extraWidthInLineHeights: 32, paddingInLineHeights: 4 },
  { extraWidthInLineHeights: 16, paddingInLineHeights: 2 },
  { extraWidthInLineHeights: 2, paddingInLineHeights: 1 },
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
  let typewriterMode = context.settings.typewriterMode
  let lineWidth = context.settings.lineWidth ?? Number.MAX_SAFE_INTEGER
  let geometry = computeGeometryForFont(font, context)

  if (lineWidth == 0 || lineWidth == Number.MAX_SAFE_INTEGER) {
    if (typewriterMode) {
      geometry.viewportPadding.top = viewportSize.height * typewriterMode
    }
  } else {
    let inverseGolden = 1 / GOLDEN_RATIO
    let xWidth = geometry.fontAttributes.xWidth
    let textWidth = Math.ceil(xWidth * lineWidth)
    let rowWidth =
      textWidth +
      geometry.rowPadding.width +
      Math.max(geometry.rowTextMargin.width, geometry.rowTextPadding.width)
    let rowToViewRatio = rowWidth / viewportSize.width

    if (context.settings.allowFontScaling == true) {
      if (rowToViewRatio > 2) {
        font = font.withPointSize(geometry.fontAttributes.pointSize - 1)
        geometry = computeGeometryForFont(font, context)
      } else if (rowToViewRatio < inverseGolden) {
        let desiredRowWidth = viewportSize.width * inverseGolden
        let neededScale = 1.0 + (desiredRowWidth - rowWidth) / desiredRowWidth
        let newPointSize = geometry.fontAttributes.pointSize * neededScale
        // Round to whole point sizes to avoid sub-pixel flickering during resize
        newPointSize = Math.round(newPointSize)
        font = font.withPointSize(newPointSize)
        geometry = computeGeometryForFont(font, context)
      }
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
      geometry.viewportPadding.top = viewportSize.height * typewriterMode
    } else {
      let lineHeight = geometry.fontAttributes.pointSize * context.settings.lineHeightMultiple
      for (const tier of VERTICAL_PADDING_TIERS) {
        if (rowWrapWidth + lineHeight * tier.extraWidthInLineHeights < viewportSize.width) {
          geometry.viewportPadding.top = lineHeight * tier.paddingInLineHeights
          break
        }
      }
    }
  }

  let uiScale = geometry.uiScale
  let handleWidth = Math.max(1, HANDLE_WIDTH_MULTIPLIER * uiScale)
  let handleHeight = Math.max(1, HANDLE_HEIGHT_MULTIPLIER * uiScale)
  let handleImage = buildHandleImage(handleWidth, handleHeight, context.theme.colors.handle)
  let handleUnloadedImage = buildHandleImage(handleWidth, handleHeight, context.theme.colors.handleUnloaded)

  let values = {
    font: font,
    fontAttributes: geometry.fontAttributes,
    indent: geometry.indent,
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
  let viewportPadding = new Insets(
    VIEWPORT_PADDING_BASE * uiScale,
    VIEWPORT_PADDING_BASE * uiScale + indent,
    viewportSize.height * BOTTOM_VIEWPORT_FRACTION,
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
