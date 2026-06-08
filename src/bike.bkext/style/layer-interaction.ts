import { Color, Text, Image, EditorStyle } from 'bike/style'
import { computeValues, symbolImage } from './util'
import { underlineHighlight, dropLine } from './style-helpers'

export function registerInteractionLayers(style: EditorStyle) {
  style.layer('selection', (row, run, caret, viewport, include) => {
    row(`.selection() = block`, (context, row) => {
      let colors = context.theme.colors
      let values = computeValues(context)
      let selection = context.isKey
        ? colors.blockBackgroundSelected
        : colors.contentBackgroundSelectedUnemphasized
      row.decoration('selection', (background, layout) => {
        background.anchor.x = 0
        background.anchor.y = 0
        background.x = layout.leadingContent
        background.y = layout.top
        background.width = layout.trailing.minus(layout.leadingContent)
        background.height = layout.text.bottom.minus(layout.top).offset(row.text.margin.bottom)
        background.color = selection
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
        : colors.contentBackgroundSelectedUnemphasized

      text.decoration('selection', (sel, layout) => {
        sel.zPosition = -2
        sel.anchor.x = 0
        sel.anchor.y = 0
        sel.x = layout.leading
        sel.y = layout.top
        sel.color = selection
        sel.corners.radius = 3 * values.uiScale
        sel.mergable = true
      })
    })

    run(`.@view-selected-range and @view-marked-range`, (context, text) => {
      let colors = context.theme.colors
      text.underline.thick = true
      text.underline.color = colors.accent
    })

    // A selected newline (the gap between two rows) draws a thin pilcrow sliver
    // just past the end of the upstream row. Uses a row-text decoration at the
    // last line's trailing edge so it also renders when the row is empty (where
    // a run decoration would have nothing to attach to).
    row(`.selected-newline() = upstream`, (context, row) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      let selection = context.isKey
        ? colors.textBackgroundSelected
        : colors.contentBackgroundSelectedUnemphasized

      row.text.decoration('selectedNewline', (sel, layout) => {
        sel.zPosition = -2
        sel.anchor.x = 0
        sel.anchor.y = 0
        sel.x = layout.lastLine.trailing
        sel.y = layout.lastLine.top
        sel.width = layout.fixed(values.fontAttributes.xWidth * 1.25)
        sel.height = layout.lastLine.height
        sel.color = selection
        sel.corners.radius = 3 * values.uiScale
        sel.mergable = false
        sel.contents.image = symbolImage('paragraphsign', colors.caret, values.font)
        sel.contents.gravity = 'resizeAspect'
      })
    })

    run(`.@view-marked-range`, (context, text) => {
      text.underline.thick = true
      text.underline.color = context.theme.colors.textBackgroundSelected
    })

    // Invisibles: a space inside a text selection draws a faint glyph over the
    // (otherwise blank) character so the user can see exactly what they've
    // selected. The Swift side tags each selected space with
    // `view-selected-space` (one run per char).
    run(`.@view-selected-space`, (context, text) => {
      let values = computeValues(context)
      let colors = context.theme.colors
      text.decoration('invisibleSpace', (glyph, layout) => {
        glyph.anchor.x = 0
        glyph.anchor.y = 0
        glyph.x = layout.leading
        glyph.y = layout.top
        glyph.contents.image = Image.fromText(new Text('·', values.font, colors.caret))
        glyph.contents.gravity = 'center'
      })
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
      // While the editor itself is focused, fall back to the standard text-selection
      // appearance — the bright "current match" highlight is only for when an external
      // UI (Find panel, Check panel, Filter field) is driving and owns focus.
      if (context.isKey) return

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
