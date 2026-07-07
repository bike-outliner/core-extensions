import { EditorStyle } from 'bike/style'
import { computeValues, symbolImage } from './util'

export function registerControlsLayer(style: EditorStyle) {
  style.layer('controls', (row, run, caret, viewport, include) => {
    row(`.parent() = true`, (context, row) => {
      if (context.settings.showFocusArrows) {
        let values = computeValues(context)
        row.text.decoration('focus', (focus, layout) => {
          // Cap at a text-height strip anchored to the bottom of the last
          // line, so a tall image line gets a normal-sized arrow at its
          // trailing-bottom corner. For text lines this is exactly the old
          // full-line size centered on the line.
          let size = layout.lastLine.height.min(values.lineHeight)
          focus.commandName = 'bike:.click-focus'
          focus.contents.gravity = 'center'
          focus.contents.image = symbolImage(
            'arrow.down.forward',
            context.theme.colors.focusArrow,
            values.font,
          )
          focus.x = layout.lastLine.trailing.offset(size.scale(0.5)).offset(row.text.padding.right)
          focus.y = layout.lastLine.bottom.offset(size.scale(-0.5))
          focus.width = size
          focus.height = size
          focus.transitions.position = false
          if (context.isTyping && context.settings.hideControlsWhenTyping) {
            focus.opacity = 0
          }
        })
      }
    })

    row(`.parent() = true and focused-root() = true`, (context, row) => {
      if (context.settings.showFocusArrows) {
        row.text.decoration('focus', (focus, _) => {
          focus.rotation = 3.14
        })
      }
    })

    row(`.parent() = true and collapsed() = true`, (context, row) => {
      let values = computeValues(context)
      row.decoration('handle', (handle, _) => {
        handle.contents.image = values.handleImage
      })
    })

    row(`.expanded() = true`, (context, row) => {
      row.decoration('handle', (handle, _) => {
        handle.rotation = 1.57
      })
      if (context.settings.showGuideLines) {
        let values = computeValues(context)
        row.decoration('guide', (guide, layout) => {
          // Match the guide's capped-strip top set in the base layer.
          let strip = layout.firstLine.height.min(values.lineHeight)
          guide.height = layout.bottom.minus(layout.firstLine.top.offset(strip))
        })
      }
    })

    row(`.body @text = "" and parent() = false and selection() = null`, (context, row) => {
      row.decoration('handle', (handle, _) => {
        handle.opacity = 0.0
      })
    })
  })
}
