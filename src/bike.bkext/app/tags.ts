import { CompletionItem, OutlineEditor, Outline, Row, RowRun } from 'bike/app'

// Tag entry: typed `@name` tokens convert to tag chips (a U+FFFC character
// carrying the `tag` text attribute; Bike's reconciler projects the row
// attribute from it). Space/Return complete a token; `=` completes it and
// opens the tag card focused on its Value field; while typing, a completion
// provider offers existing tag names. Values are never typed inline — they
// are set through the tag card.

/** Mirror of Bike's reserved row attribute names (`Row.untaggableAttributeNames`). */
const RESERVED = new Set(['id', 'text', 'type', 'created', 'modified', 'indent'])

const OBJECT_REPLACEMENT_CHAR = '￼'

export interface TagToken {
  /** Empty right after a bare `@`. */
  name: string
  /** Character offsets, `@` through the last name character. */
  range: [number, number]
  /** True when the name is non-empty. */
  isComplete: boolean
  /** True when the name is reserved (never converts). */
  isReserved: boolean
}

/**
 * Split into the units Bike's native side counts text with (Swift
 * `Character`s — grapheme clusters), so ranges round-trip correctly even
 * with emoji before the token.
 */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter().segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

const NAME_START_CHAR = /^[\p{L}_:]$/u
const NAME_CHAR = /^[\p{L}\p{N}_:.\-]$/u
const WHITESPACE = /^\s$/

/**
 * The tag token whose prefix contains `caret` (`range[0] < caret <=
 * range[1]`), or undefined. The `@` must be at start of line or after
 * whitespace (so emails like jesse@hogbay.com never produce a token) and
 * the name uses a subset of OutlinePath's Name grammar. A bare `@` is a
 * token (empty name) but not complete.
 */
export function composingTagToken(text: string, caret: number): TagToken | undefined {
  const chars = graphemes(text)
  if (caret <= 0 || caret > chars.length) {
    return undefined
  }

  // Nearest `@` before the caret at start of line or after whitespace,
  // scanning past non-boundary `@`s (emails).
  let at = -1
  for (let i = caret - 1; i >= 0; i--) {
    const char = chars[i]
    if (char === '\n') {
      break
    }
    if (char === '@' && (i === 0 || WHITESPACE.test(chars[i - 1]))) {
      at = i
      break
    }
  }
  if (at < 0) {
    return undefined
  }

  // Forward-parse the maximal token prefix: `@` name.
  let pos = at + 1
  while (
    pos < chars.length &&
    (pos === at + 1 ? NAME_START_CHAR.test(chars[pos]) : NAME_CHAR.test(chars[pos]))
  ) {
    pos++
  }
  const name = chars.slice(at + 1, pos).join('')

  if (caret <= at || caret > pos) {
    return undefined
  }

  return {
    name,
    range: [at, pos],
    isComplete: name.length > 0,
    isReserved: RESERVED.has(name),
  }
}

/** Distinct non-reserved tag names used anywhere in the document, sorted. */
export function collectTagNames(outline: Outline): string[] {
  const result = outline.query('//*/run::*')
  const names = new Set<string>()
  if (result.type === 'elements') {
    for (const each of result.value) {
      const name = (each as RowRun).runAttributes?.['tag']
      if (name && !RESERVED.has(name)) {
        names.add(name)
      }
    }
  }
  return [...names].sort()
}

/**
 * Replace the typed token at `range` (plus `trailing` extra characters,
 * e.g. a typed `=`) with a tag chip and set the projected row attribute —
 * preserving any existing attribute value — in one undo group. With
 * `openCard` the chip is selected and the tag card opens focused on its
 * Value field; otherwise the caret lands at `caretAfter`.
 */
export function commitTag(
  editor: OutlineEditor,
  row: Row,
  range: [number, number],
  name: string,
  options: { trailing: number; openCard: boolean; caretAfter?: number }
) {
  const existing = row.getAttribute(name) as string | undefined
  editor.breakUndoCoalescing()
  editor.transaction({ label: 'Add Tag', animate: 'none' }, () => {
    row.text.replace([range[0], range[1] + options.trailing], OBJECT_REPLACEMENT_CHAR)
    row.text.addAttribute('tag', name, [range[0], range[0] + 1])
    row.setAttribute(name, existing ?? '')
    if (options.openCard) {
      editor.prepareTagValueEdit()
      editor.selectText(row, range[0], range[0] + 1)
    } else if (options.caretAfter !== undefined) {
      editor.selectCaret(row, options.caretAfter)
    }
  })
  editor.breakUndoCoalescing()
}

/**
 * Text input handler: complete a typed `@name` token on Space, Return, or
 * `=` (which also opens the tag card on the Value field).
 */
export function handleTagTextInput(context: {
  editor: OutlineEditor
  row: Row
  caret: number
  typed: string
}): boolean {
  const { editor, row, caret, typed } = context

  if (typed !== ' ' && typed !== '\n' && typed !== '=') {
    return false
  }

  // Shortcut: `=` typed immediately after an existing attribute chip
  // removes the `=` and opens the chip's card focused on Value.
  if (typed === '=' && caret >= 2) {
    const chars = graphemes(row.text.string)
    if (chars[caret - 2] === OBJECT_REPLACEMENT_CHAR && row.text.attributeAt('tag', caret - 2)) {
      editor.breakUndoCoalescing()
      editor.transaction({ label: 'Edit Attribute', animate: 'none' }, () => {
        row.text.replace([caret - 1, caret], '')
        editor.prepareTagValueEdit()
        editor.selectText(row, caret - 2, caret - 1)
      })
      return true
    }
  }

  // For Space and `=` the typed character is already in the text at
  // caret - 1 and the token must end right before it; for Return the row
  // was split and the token must end at the (old) caret.
  const tokenEnd = typed === '\n' ? caret : caret - 1
  const token = composingTagToken(row.text.string, tokenEnd)
  if (!token || token.range[1] !== tokenEnd || !token.isComplete || token.isReserved) {
    return false
  }

  switch (typed) {
    case ' ':
      // Chip replaces the token; the typed space stays after it.
      commitTag(editor, row, token.range, token.name, {
        trailing: 0,
        openCard: false,
        caretAfter: token.range[0] + 2,
      })
      return true
    case '\n':
      // The caret already sits on the new row; leave it there.
      commitTag(editor, row, token.range, token.name, { trailing: 0, openCard: false })
      return true
    case '=':
      // Chip replaces the token AND the typed `=`; the card opens on Value.
      commitTag(editor, row, token.range, token.name, { trailing: 1, openCard: true })
      return true
  }

  return false
}

/**
 * Completion provider: while typing an `@name` token offer existing tag
 * names, or a "Create Tag" action for a new name. Accepting converts the
 * token to a chip.
 */
export function provideTagCompletions(context: { editor: OutlineEditor; row: Row; caret: number }) {
  const { editor, row, caret } = context

  const token = composingTagToken(row.text.string, caret)
  if (!token || token.range[1] !== caret) {
    return undefined
  }

  const names = collectTagNames(editor.outline)

  let emptyFallback: CompletionItem | undefined
  if (token.name.length > 0 && !token.isReserved && !names.includes(token.name)) {
    emptyFallback = { id: 'bike.create-tag', name: `Create Tag \u{201C}${token.name}\u{201D}`, create: true }
  }

  if (names.length === 0 && !emptyFallback) {
    return undefined
  }

  const range = token.range
  return {
    range,
    pattern: token.name,
    items: names.map((name) => ({ name })),
    emptyFallback,
    accept(item: CompletionItem) {
      const name = item['create'] ? token.name : item.name
      commitTag(editor, row, range, name, {
        trailing: 0,
        openCard: false,
        caretAfter: range[0] + 1,
      })
    },
  }
}

/** Register the tag-entry text input handler and completion provider. */
export function registerTagEntry() {
  bike.textInput.addHandler({
    handle: handleTagTextInput,
    provideCompletions: provideTagCompletions,
  })
}
