import { Color, Text, Image, EditorStyle } from 'bike/style'
import { computeValues, symbolImage, buildCircleImage } from './util'
import { underlineHighlight, dropLine } from './style-helpers'

// iOS block-selection drag handles: filled dots at the selection band's
// leading-top and trailing-bottom corners. Drawn by the style so they track
// the band's exact geometry for any theme; the iOS host hit-tests them (by
// commandName) to start the drag interaction. macOS uses the mouse and never
// draws these.
const SELECTION_HANDLE_DIAMETER = 22

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

    // Leading handle: dot at the band's top-leading corner (first block row).
    row(`.selection-first() = true`, (context, row) => {
      if (context.os !== 'iOS') return
      let values = computeValues(context)
      let diameter = SELECTION_HANDLE_DIAMETER * values.uiScale
      let image = buildCircleImage(diameter, context.theme.colors.accent)
      row.decoration('selectionHandleLeading', (handle, layout) => {
        handle.commandName = 'bike:.selection-handle-leading'
        handle.anchor.x = 0.5
        handle.anchor.y = 0.5
        handle.x = layout.leadingContent
        handle.y = layout.top.offset(-diameter / 2 - values.uiScale)
        handle.width = layout.fixed(diameter)
        handle.height = layout.fixed(diameter)
        handle.contents.image = image
        handle.contents.gravity = 'center'
        handle.zPosition = 10
      })
    })

    // Trailing handle: dot at the band's bottom-trailing corner (last block row).
    row(`.selection-last() = true`, (context, row) => {
      if (context.os !== 'iOS') return
      let values = computeValues(context)
      let diameter = SELECTION_HANDLE_DIAMETER * values.uiScale
      let image = buildCircleImage(diameter, context.theme.colors.accent)
      row.decoration('selectionHandleTrailing', (handle, layout) => {
        handle.commandName = 'bike:.selection-handle-trailing'
        handle.anchor.x = 0.5
        handle.anchor.y = 0.5
        handle.x = layout.trailing
        handle.y = layout.text.bottom.offset(row.text.margin.bottom + diameter / 2 + values.uiScale)
        handle.width = layout.fixed(diameter)
        handle.height = layout.fixed(diameter)
        handle.contents.image = image
        handle.contents.gravity = 'center'
        handle.zPosition = 10
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

    // Text-selection leading handle: dot above the selection start (first
    // selected run's leading edge). Same command name as the block handle —
    // the host resolves the edge and re-anchors per selection kind.
    run(`.start-of-matches(.@view-selected-range) = true`, (context, text) => {
      if (context.os !== 'iOS') return
      let values = computeValues(context)
      let diameter = SELECTION_HANDLE_DIAMETER * values.uiScale
      let image = buildCircleImage(diameter, context.theme.colors.accent)
      text.decoration('selectionHandleLeading', (handle, layout) => {
        handle.commandName = 'bike:.selection-handle-leading'
        handle.fragmentPlacement = 'first'
        handle.anchor.x = 0.5
        handle.anchor.y = 0.5
        handle.x = layout.leading
        handle.y = layout.top.offset(-diameter / 2 - values.uiScale)
        handle.width = layout.fixed(diameter)
        handle.height = layout.fixed(diameter)
        handle.contents.image = image
        handle.contents.gravity = 'center'
        handle.zPosition = 10
      })
    })

    // Text-selection trailing handle: dot below the selection end (last
    // selected run's trailing edge).
    run(`.end-of-matches(.@view-selected-range) = true`, (context, text) => {
      if (context.os !== 'iOS') return
      let values = computeValues(context)
      let diameter = SELECTION_HANDLE_DIAMETER * values.uiScale
      let image = buildCircleImage(diameter, context.theme.colors.accent)
      text.decoration('selectionHandleTrailing', (handle, layout) => {
        handle.commandName = 'bike:.selection-handle-trailing'
        handle.fragmentPlacement = 'last'
        handle.anchor.x = 0.5
        handle.anchor.y = 0.5
        handle.x = layout.trailing
        handle.y = layout.bottom.offset(diameter / 2 + values.uiScale)
        handle.width = layout.fixed(diameter)
        handle.height = layout.fixed(diameter)
        handle.contents.image = image
        handle.contents.gravity = 'center'
        handle.zPosition = 10
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
