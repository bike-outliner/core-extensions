import { Color, Image, StyleContext, RowStyle, TextRunStyle, Layout, LayoutValue } from 'bike/style'
import { computeValues, symbolImage } from './util'

export function listMark(context: StyleContext, row: RowStyle, image: Image, commandName?: string) {
  let values = computeValues(context)
  row.text.margin.left = Math.floor(values.indent * 2)
  row.text.decoration('mark', (mark, layout) => {
    if (commandName) mark.commandName = commandName
    mark.x = layout.leading.offset(-values.indent / 2)
    mark.y = layout.firstLine.centerY
    let size = layout.firstLine.height
    mark.width = size
    mark.height = size
    mark.contents.gravity = 'center'
    mark.contents.image = image
  })
}

export function underlineHighlight(context: StyleContext, run: TextRunStyle, name: string, color: Color) {
  let values = computeValues(context)
  run.decoration(name, (highlight, layout) => {
    highlight.anchor.x = 0
    highlight.anchor.y = 0
    highlight.y = layout.baseline.offset(2 * values.uiScale)
    highlight.x = layout.leading
    highlight.height = layout.fixed(2 * values.uiScale)
    highlight.width = layout.width
    highlight.color = color
    highlight.corners.radius = 1 * values.uiScale
    highlight.zPosition = -2
  })
}

export function dropLine(context: StyleContext, row: RowStyle, yPosition: (layout: Layout) => LayoutValue) {
  let values = computeValues(context)
  let colors = context.theme.colors
  row.decoration('dropIndicator', (dropIndicator, layout) => {
    dropIndicator.anchor.x = 0
    dropIndicator.x = layout.leadingContent
    dropIndicator.width = layout.width.offset(layout.leadingContent.scale(-1))
    dropIndicator.y = yPosition(layout)
    dropIndicator.height = layout.fixed(Math.max(3 * values.uiScale, 2))
    dropIndicator.color = colors.accent
    dropIndicator.corners.radius = 1.5 * values.uiScale
    dropIndicator.transitions.clear()
    dropIndicator.zPosition = -1
  })
}

export function restoreWritingFocus(context: StyleContext, text: TextRunStyle) {
  let values = computeValues(context)
  let textFocusAlpha = values.textFocusAlpha
  text.color = text.color.withAlpha(1.0)
  text.underline.color = text.underline.color.withAlpha(1.0)
  text.strikethrough.color = text.strikethrough.color.withAlpha(1.0)
  text.backgroundColor = text.backgroundColor.withAlpha(1.0)
  text.decorations((each, _) => {
    each.opacity /= textFocusAlpha
  })
}
