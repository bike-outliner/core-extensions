import { Color, Text, Image, SymbolConfiguration, EditorStyle } from 'bike/style'
import { computeValues, symbolImage } from './util'
import { listMark } from './style-helpers'

export function registerFormattingLayers(style: EditorStyle) {
  style.layer('row-formatting', (row, run, caret, viewport, include) => {
    row(`.body`, (context, row) => {
      context.theme.rows.body.apply(row.text)
    })

    row(`.heading`, (context, row) => {
      context.theme.rows.heading.apply(row.text)
    })

    row(`.blockquote`, (context, row) => {
      context.theme.rows.blockquote.apply(row.text)

      let values = computeValues(context)
      let colors = context.theme.colors
      let indent = values.indent
      row.text.margin.left = Math.floor(indent * 2)
      row.text.decoration('mark', (mark, layout) => {
        mark.anchor.y = 0
        mark.y = layout.top
        mark.x = layout.leading.offset(-values.indent / 2)
        mark.height = layout.height.offset(row.text.margin.top + row.text.margin.bottom)
        mark.width = layout.fixed(Math.max(4 * values.uiScale, 0.5))
        mark.color = colors.text.withAlpha(0.7)
        mark.corners.radius = 3 * values.uiScale
        mark.corners.maxXMinYCorner = false
        mark.corners.maxXMaxYCorner = false
        mark.mergable = true
        mark.zPosition = -2
      })

      row.text.decoration('blockquote', (block, layout) => {
        block.anchor.x = 0
        block.anchor.y = 0
        let adjust = layout
          .fixed(0)
          .offset(-values.indent / 2)
          .offset(-1 * values.uiScale)
        block.x = layout.leading.offset(adjust)
        block.y = layout.top
        block.height = layout.height.offset(row.text.margin.top + row.text.margin.bottom)
        block.width = layout.text.width.offset(adjust.scale(-1))
        block.color = colors.text.withAlpha(0.02)
        block.corners.radius = 3 * values.uiScale
        block.border.width = 0.5 * values.uiScale
        block.border.color = colors.text.withAlpha(0.05)
        block.mergable = true
        block.zPosition = -3
      })
    })

    row(`.codeblock`, (context, row) => {
      context.theme.rows.codeblock.apply(row.text)
    })

    row(`.note`, (context, row) => {
      context.theme.rows.note.apply(row.text)
    })

    row(`.unordered`, (context, row) => {
      context.theme.rows.unorderedList.apply(row.text)
      let pointSize = row.text.font.resolve(context).pointSize
      let font = row.text.font.withPointSize(pointSize * 0.3)
      listMark(context, row, symbolImage('circle.fill', row.text.color, font))
    })

    row(`.ordered`, (context, row) => {
      context.theme.rows.orderedList.apply(row.text)
      let index = context.orderedIndex ?? 0
      listMark(context, row, Image.fromText(new Text(index + '.', row.text.font, row.text.color)))
    })

    row(`.task`, (context, row) => {
      context.theme.rows.task.apply(row.text)
      listMark(context, row, symbolImage('square', row.text.color, row.text.font), 'row:toggle-done')
    })

    row(`.@done`, (context, row) => {
      row.text.strikethrough.thick = true
      row.text.strikethrough.color = row.text.color
    })

    row(`.task @done`, (context, row) => {
      row.text.decoration('mark', (mark, _) => {
        mark.contents.image = symbolImage('checkmark.square', row.text.color, row.text.font)
      })
    })

    row(`.hr`, (context, row) => {
      context.theme.rows.horizontalRule.apply(row.text)

      let values = computeValues(context)
      row.text.decoration('ruler', (ruler, layout) => {
        ruler.height = layout.fixed(Math.max(1 * values.uiScale, 0.5))
        ruler.width = layout.width.minus(row.text.padding.width)
        ruler.color = row.text.color
      })
    })
  })

  style.layer(`run-formatting`, (row, run, caret, viewport, include) => {
    run('.@em', (context, text) => {
      context.theme.runs.emphasis.apply(text)
    })

    run(`.@strong`, (context, text) => {
      context.theme.runs.strong.apply(text)
    })

    run(`.@code`, (context, text) => {
      context.theme.runs.code.apply(text)
    })

    run(`.@mark`, (context, text) => {
      let savedBackgroundColor = text.backgroundColor
      let markColor = context.theme.runs.mark.backgroundColor

      context.theme.runs.mark.apply(text)

      text.backgroundColor = savedBackgroundColor

      let values = computeValues(context)
      let uiScale = values.uiScale
      text.decoration('mark', (mark, layout) => {
        mark.zPosition = -1
        mark.anchor.x = 0
        mark.anchor.y = 0
        mark.x = layout.leading.offset(-2 * uiScale)
        mark.y = layout.top
        mark.width = layout.width.offset(4 * uiScale)
        mark.height = layout.height
        mark.corners.radius = 3 * uiScale
        if (markColor) {
          mark.color = markColor
          mark.border.width = 1 * uiScale
          mark.border.color = markColor.withFraction(0.1, context.theme.colors.text)
        }
        mark.mergable = true
      })
    })

    run(`.start-of-matches(.@mark) = true`, (context, text) => {
      text.margin.left = 2.5 * computeValues(context).uiScale
    })

    run(`.end-of-matches(.@mark) = true`, (context, text) => {
      text.margin.right = 2.5 * computeValues(context).uiScale
    })

    run(`.@s`, (context, text) => {
      context.theme.runs.strikethrough.apply(text)
    })

    run(`.@a`, (context, text) => {
      context.theme.runs.link.apply(text)
    })

    run(`.end-of-matches(.@a) = true`, (context, text) => {
      let symbol = new SymbolConfiguration('arrow.up.forward.app')
        .withSymbolScale('medium')
        .withFont(text.font.withWeight('semibold'))
        .withHierarchicalColor(text.color.withAlpha(1))
      let image = Image.fromSymbol(symbol)
      let imageWidth = image.resolve(context).width * 1.1
      text.padding.right = imageWidth
      text.decoration('button', (button, layout) => {
        button.commandName = 'bike:.click-link'
        button.fragmentPlacement = 'last'
        button.x = layout.trailing
        button.anchor.x = 0
        button.width = layout.fixed(imageWidth)
        button.contents.gravity = 'center'
        button.contents.image = image
      })
    })

    run(`.@base = sub`, (context, text) => {
      let baseSize = text.font.resolve(context).pointSize
      text.font = text.font.withPointSize(0.75 * baseSize)
      text.baselineOffset = baseSize * -0.25
    })

    run(`.@base = sup`, (context, text) => {
      let baseSize = text.font.resolve(context).pointSize
      text.font = text.font.withPointSize(0.75 * baseSize)
      text.baselineOffset = baseSize * 0.25
    })

    run(`.@embed/parent::hr`, (context, text) => {
      text.embedSize.width = 1
    })
  })
}
