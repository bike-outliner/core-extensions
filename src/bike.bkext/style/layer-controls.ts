import { EditorStyle } from 'bike/style'
import { computeValues, symbolImage } from './util'
import { hiddenWhileTyping } from './style-helpers'

export function registerControlsLayer(style: EditorStyle) {
  style.layer('controls', (row, run, caret, viewport, include) => {
    row(`.parent() = true`, (context, row) => {
      if (context.settings.showFocusArrows) {
        let values = computeValues(context)
        row.decoration('focus', (focus, layout) => {
          let size = layout.lastLine.height.min(values.lineHeight)
          focus.flow = 'trailing'
          focus.order = 10
          focus.commandName = 'bike:.click-focus'
          focus.contents.gravity = 'center'
          focus.contents.image = symbolImage(
            'arrow.down.forward',
            context.theme.colors.focusArrow,
            values.font,
          )
          focus.width = size
          focus.height = size
          focus.transitions.position = false
          // Grouped with badges, not handles: the focus arrow shares their
          // trailing flow, so the trailing cluster fades as one.
          if (hiddenWhileTyping(context, 'badges')) {
            focus.opacity = 0
          }
        })
      }
    })

    row(`.parent() = true and focused-root() = true`, (context, row) => {
      if (context.settings.showFocusArrows) {
        row.decoration('focus', (focus, _) => {
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
