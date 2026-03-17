import { EditorStyle } from 'bike/style'
import { computeValues } from './util'
import { restoreWritingFocus } from './style-helpers'

export function registerFocusLayers(style: EditorStyle) {
  style.layer('outline-focus', (row, run, caret, viewport, include) => {
    // Modifies row decorations, so needs to be after layers that add decorations
    row(`.focused-branch() = false`, (context, row) => {
      let values = computeValues(context)
      row.opacity = values.outlineFocusAlpha
      row.decorations((each, _) => {
        each.opacity = 0
      })
      row.text.decorations((each, _) => {
        each.opacity *= values.outlineFocusAlpha
      })
    })
  })

  style.layer('text-focus', (row, run, caret, viewport, include) => {
    row(`.*`, (context, row) => {
      if (context.settings.writingFocusMode) {
        let values = computeValues(context)
        let textFocusAlpha = values.textFocusAlpha
        row.text.color = row.text.color.withAlpha(textFocusAlpha)
        row.text.underline.color = row.text.underline.color.withAlpha(textFocusAlpha)
        row.text.strikethrough.color = row.text.strikethrough.color.withAlpha(textFocusAlpha)
        row.text.backgroundColor = row.text.backgroundColor.withAlpha(textFocusAlpha)
        row.decorations((each, _) => {
          each.opacity *= textFocusAlpha
        })
        row.text.decorations((each, _) => {
          each.opacity *= textFocusAlpha
        })
      }
    })

    run(`.*`, (context, text) => {
      if (context.settings.writingFocusMode) {
        let values = computeValues(context)
        let textFocusAlpha = values.textFocusAlpha
        text.color = text.color.withAlpha(textFocusAlpha)
        text.underline.color = text.underline.color.withAlpha(textFocusAlpha)
        text.strikethrough.color = text.strikethrough.color.withAlpha(textFocusAlpha)
        text.backgroundColor = text.backgroundColor.withAlpha(textFocusAlpha)
        text.decorations((each, _) => {
          each.opacity *= textFocusAlpha
        })
      }
    })

    row(`.selection() = block`, (context, row) => {
      if (context.settings.writingFocusMode) {
        let values = computeValues(context)
        let textFocusAlpha = values.textFocusAlpha
        row.decorations((each, _) => {
          each.opacity /= textFocusAlpha
        })
        row.text.decorations((each, _) => {
          each.opacity /= textFocusAlpha
        })
      }
    })

    for (const mode of ['word', 'sentence', 'paragraph'] as const) {
      run(`.@view-writing-focus-${mode}`, (context, text) => {
        if (context.settings.writingFocusMode == mode) {
          restoreWritingFocus(context, text)
        }
      })
    }
  })

  style.layer('filter-match', (row, run, caret, viewport, include) => {
    row(`.filter-match() = false and selection() = null`, (context, row) => {
      if (context.isFiltering) {
        row.text.scale = 0.25
        row.text.margin.left *= 0.5
        row.decorations((each, _) => {
          each.opacity = 0
        })
      }
    })
  })
}
