import { EditorStyle } from 'bike/style'
import { computeValues, symbolImage } from './util'

export function registerControlsLayer(style: EditorStyle) {
  style.layer('controls', (row, run, caret, viewport, include) => {
    row(`.parent() = true`, (context, row) => {
      if (context.settings.showFocusArrows) {
        let values = computeValues(context)
        row.text.decoration('focus', (focus, layout) => {
          let size = layout.lastLine.height
          focus.commandName = 'bike:.click-focus'
          focus.contents.gravity = 'center'
          focus.contents.image = symbolImage(
            'arrow.down.forward',
            context.theme.colors.focusArrow,
            values.font,
          )
          focus.x = layout.lastLine.trailing.offset(size.scale(0.5)).offset(row.text.padding.right)
          focus.y = layout.lastLine.centerY
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
        row.decoration('guide', (guide, layout) => {
          guide.height = layout.bottom.minus(layout.firstLine.bottom)
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
