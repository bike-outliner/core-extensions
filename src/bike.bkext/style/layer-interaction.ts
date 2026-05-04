import { Color, EditorStyle } from 'bike/style'
import { computeValues } from './util'
import { underlineHighlight, dropLine } from './style-helpers'

export function registerInteractionLayers(style: EditorStyle) {
  style.layer('selection', (row, run, caret, viewport, include) => {
    row(`.selection() = block`, (context, row) => {
      let colors = context.theme.colors
      let values = computeValues(context)
      let selection = context.isKey
        ? colors.blockBackgroundSelected
        : colors.text.mixed(colors.background, 0.863)
      row.decoration('selection', (background, layout) => {
        background.anchor.x = 0
        background.anchor.y = 0
        background.x = layout.leadingContent
        background.y = layout.top
        background.width = layout.width.offset(layout.leadingContent.scale(-1))
        background.height = layout.text.bottom.minus(layout.top).offset(row.text.margin.bottom)
        background.color = selection
        background.border.width = 1 * values.uiScale
        background.border.color = selection.mixed(colors.text, 0.1)
        background.corners.radius = 3 * values.uiScale
        background.mergable = true
        background.transitions.color = false
        background.zPosition = -2
      })
    })

    run(`.@view-selected-range and not @view-marked-range`, (context, text) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      let selection = context.isKey
        ? colors.textBackgroundSelected
        : colors.text.mixed(colors.background, 0.863)

      text.decoration('selection', (sel, layout) => {
        sel.zPosition = -2
        sel.anchor.x = 0
        sel.anchor.y = 0
        sel.x = layout.leading
        sel.y = layout.top
        sel.color = selection
        sel.border.width = 1 * values.uiScale
        sel.border.color = selection.mixed(colors.text, 0.1)
        sel.corners.radius = 3 * values.uiScale
        sel.mergable = true
      })
    })

    run(`.@view-selected-range and @view-marked-range`, (context, text) => {
      let colors = context.theme.colors
      text.underline.thick = true
      text.underline.color = colors.accent
    })

    run(`.@view-marked-range`, (context, text) => {
      text.underline.thick = true
      text.underline.color = context.theme.colors.textBackgroundSelected
    })
  })

  style.layer('highlights', (row, run, caret, viewport, include) => {
    run(`.@view-find-highlight`, (context, run) => {
      run.backgroundColor = context.theme.colors.findMatch
    })

    run(`.@view-check-spelling`, (context, run) => {
      underlineHighlight(context, run, 'check-spelling', context.theme.colors.spelling)
    })

    run(`.@view-check-grammar`, (context, run) => {
      underlineHighlight(context, run, 'check-grammar', context.theme.colors.grammar)
    })

    run(`.@view-active-replacement`, (context, run) => {
      underlineHighlight(context, run, 'check-replacement', context.theme.colors.replacement)
    })

    run(`.@view-find-current or @view-check-current`, (context, run) => {
      let colors = context.theme.colors
      let values = computeValues(context)
      let uiScale = values.uiScale

      if (context.isDarkMode) {
        run.color = Color.black()
      }

      run.backgroundColor = Color.clear()

      run.decoration('selection', (selection, layout) => {
        selection.color = colors.findMatchCurrent
        selection.corners.radius = 2 * uiScale
        selection.border.width = 0
        selection.shadow.opacity = 0.4
        selection.shadow.radius = 2
        selection.shadow.offset.height = 0
      })
    })
  })

  style.layer('drag-and-drop', (row, run, caret, viewport, include) => {
    row(`.selection() = block or selection-descendant() = block`, (context, row) => {
      if (context.isDragSource) {
        row.opacity *= 0.15
        row.decorations((each, _) => {
          each.opacity *= 0.15
        })
      }
    })

    row(`.drop-indicator() = on`, (context, row) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      row.decoration('dropIndicator', (dropIndicator, layout) => {
        dropIndicator.anchor.x = 0
        dropIndicator.anchor.y = 0
        dropIndicator.x = layout.leading
        dropIndicator.y = layout.text.top
        dropIndicator.border.color = colors.accent
        dropIndicator.border.width = 3 * values.uiScale
        dropIndicator.corners.radius = 3 * values.uiScale
        dropIndicator.height = layout.text.height
        dropIndicator.transitions.clear()
        dropIndicator.zPosition = -1
      })
    })

    row(`.drop-indicator() = above`, (context, row) => {
      dropLine(context, row, (layout) => layout.top)
    })

    row(`.drop-indicator() = below`, (context, row) => {
      dropLine(context, row, (layout) => layout.bottom)
    })
  })
}
