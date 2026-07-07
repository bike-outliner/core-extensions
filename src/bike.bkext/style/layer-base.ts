import { Color, EditorStyle } from 'bike/style'
import { computeValues } from './util'

export function registerBaseLayer(style: EditorStyle) {
  style.layer('base', (row, run, caret, viewport, include) => {
    viewport((context, viewport) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      viewport.padding = values.viewportPadding
      viewport.backgroundColor = colors.background
    })

    caret((context, caret) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      if (context.isKey) {
        let pointSize = values.fontAttributes.pointSize
        caret.color = colors.caret
        caret.width = 2 * values.uiScale
        caret.blinkStyle = 'continuous'
        caret.lineColor = context.settings.showCaretLine ? colors.caretLine : Color.clear()
        caret.messageFont = values.font
        caret.messageColor = colors.caretMessage
        caret.loadedAttributesFont = values.font.withPointSize(pointSize * 0.6)
        caret.loadedAttributesColor = Color.white()
      } else {
        caret.color = colors.contentBackgroundSelectedUnemphasized.alphaMultiplied(2)
        caret.width = 2 * values.uiScale
        caret.blinkStyle = 'none'
        caret.lineColor = context.settings.showCaretLine ? colors.contentBackgroundSelectedUnemphasized.alphaMultiplied(0.5) : Color.clear()
      }
    })

    row(`.*`, (context, row) => {
      let values = computeValues(context)
      let colors = context.theme.colors

      row.padding = values.rowPadding

      row.decoration('handle', (handle, layout) => {
        handle.commandName = 'bike:.click-handle'
        handle.capabilities = ['drag-row', 'accept-drop']
        // Anchor within a text-height strip at the top of the first line, so
        // the handle stays in the upper-leading corner when an inline image
        // makes the line tall. For text lines strip == line height, so this
        // is exactly firstLine.centerY.
        let strip = layout.firstLine.height.min(values.lineHeight)
        let size = layout.firstLine.height.min(values.indent)
        handle.contents.gravity = 'center'
        handle.contents.image = values.handleUnloadedImage
        handle.x = layout.leadingContent.offset(-values.indent / 2)
        handle.y = layout.firstLine.top.offset(strip.scale(0.5))
        handle.width = size
        handle.height = size
        if (context.isTyping && context.settings.hideControlsWhenTyping) {
          handle.opacity = 0
        }
      })

      if (context.settings.showGuideLines) {
        row.decoration('guide', (guide, layout) => {
          // Start below the same capped first-line strip the handle anchors
          // in, so a tall image line gets the guide along its flank instead
          // of leaving it bare.
          let strip = layout.firstLine.height.min(values.lineHeight)
          guide.color = colors.guideLine
          guide.x = layout.leadingContent.offset(-values.indent / 2)
          guide.y = layout.firstLine.top.offset(strip)
          guide.anchor.y = 0
          guide.width = layout.fixed(Math.max(1 * values.uiScale, 0.5))
          guide.height = layout.fixed(0)
          if (context.isTyping && context.settings.hideControlsWhenTyping) {
            guide.opacity = 0
          }
        })
      }

      row.text.font = values.font
      row.text.color = colors.text
      row.text.lineHeightMultiple = context.settings.lineHeightMultiple
      row.text.margin = values.rowTextMargin
      row.text.padding = values.rowTextPadding
    })
  })
}
