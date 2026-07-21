import { CompletionAcceptKind, CompletionContext, CompletionItem, CompletionResult } from 'bike/app'

// Attribute completion: type `@name` or `@name:value` at the END of a row's
// text to set a row attribute. The popup completes names (and values) already
// used in the outline; picking an item erases the typed token and calls
// `setAttribute` in one undo step. Esc leaves the literal text alone —
// nothing commits without an explicit pick.
//
// In names mode, Return/click commits the name valueless while Tab or `:`
// completes just the name — `@p` + `:` becomes `@priority:` in the text and
// the values popup opens — so `@p:2⏎` sets priority = 2 in four keystrokes.
//
// The trigger is deliberately narrow so ordinary prose never fires it: the
// caret must sit at the end of the row's text, the `@` must be preceded by
// whitespace (or start the row — emails never trigger), and the name part
// must be a bare identifier. Because the token is end-anchored, values may
// contain spaces unquoted: `@due:next fri` is one token.
//
// A value is optional both ways — `@done⏎` and `@done:⏎` both set `""`
// (attribute presence is the test in Bike; `@done` and valueless `@due` =
// "Soon" are both meaningful).

// Mirror of the native reserved set (`Row.untaggableAttributeNames`) plus the
// names attribute UI never displays — not offered and not committable here.
const HIDDEN_ATTRIBUTE_NAMES = new Set(['id', 'text', 'type', 'created', 'modified', 'indent'])

// A bare identifier: what the name part must look like for the token to be
// live. The moment prose makes it invalid (`ping @jesse then…` — the space
// after `jesse`), the popup closes itself.
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/

export interface AttributeToken {
  /** Index of the `@` in the row's text; the token runs to end of text. */
  start: number
  name: string
  /** Present once a `:` is typed; may be empty (`@due:`). */
  value?: string
}

/**
 * Parse the attribute token at the caret, or undefined when the caret isn't
 * at the end of text / no live token ends there. Pure — exported for tests.
 */
export function parseAttributeToken(text: string, caret: number): AttributeToken | undefined {
  if (caret !== text.length) return undefined
  // The last `@` that starts a token (preceded by whitespace or start of
  // text). Scanning right-to-left skips `@`s inside the value — in
  // `@email:foo@bar.com` the `.com` `@` isn't space-preceded, so the token
  // is the whole `email:…` pair.
  let start = -1
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
      start = i
      break
    }
  }
  if (start < 0) return undefined

  const token = text.slice(start + 1)
  const colon = token.indexOf(':')
  const name = colon >= 0 ? token.slice(0, colon) : token
  // A bare `@` (empty name, no colon) is live — it lists every name. With a
  // colon, or once characters follow, the name must be a bare identifier.
  if (name !== '' && !NAME_PATTERN.test(name)) return undefined
  if (name === '' && colon >= 0) return undefined
  return colon >= 0 ? { start, name, value: token.slice(colon + 1) } : { start, name }
}

export function registerAttributeCompletions() {
  bike.input.addHandler({ provideCompletions: provideAttributeCompletions })
}

/** The completion provider — exported so tests can drive it directly. */
export function provideAttributeCompletions(context: CompletionContext): CompletionResult | undefined {
  const { row, editor, caret } = context
  const text = row.text.string
  const token = parseAttributeToken(text, caret)
  if (!token) return undefined

  // Erase the token plus the single space before it (when present), then
  // set the attribute — one transaction, one ⌘Z.
  const commit = (item: CompletionItem) => {
    const eraseStart = token.start > 0 && text[token.start - 1] === ' ' ? token.start - 1 : token.start
    editor.transaction({ label: 'Set Attribute' }, () => {
      row.text.delete([eraseStart, text.length])
      row.setAttribute(item['attrName'], item['attrValue'])
      editor.selectText(row, eraseStart)
    })
  }

  const range: [number, number] = [token.start, text.length]

  if (token.value === undefined) {
    // Names mode: complete against attribute names already used in the
    // outline. Return/click commits the name valueless; Tab or `:`
    // (completeChars) expands the token to `@name:` — text only, nothing
    // committed — and the re-query drops straight into values mode.
    const accept = (item: CompletionItem, kind: CompletionAcceptKind) => {
      if (kind === 'complete') {
        const expanded = '@' + item['attrName'] + ':'
        editor.transaction({ label: 'Complete Attribute' }, () => {
          row.text.replace([token.start, text.length], expanded)
          editor.selectText(row, token.start + expanded.length)
        })
        return
      }
      commit(item)
    }
    const names = collectAttributeNames(editor.outline.root.descendants)
    const items = names.map((name) => ({
      // Prefixed ids: the popup auto-closes when the sole match's id
      // equals the typed pattern, which would make a fully-typed name
      // unpickable.
      id: 'attr-name:' + name,
      name,
      attrName: name,
      attrValue: '',
    }))
    // The pinned escape hatch — creates the name as typed even while an
    // existing name matches. Omitted for hidden names and when the typed
    // name IS an existing one (the escape would duplicate the match).
    const fallback =
      HIDDEN_ATTRIBUTE_NAMES.has(token.name) || names.includes(token.name)
        ? undefined
        : { id: 'attr-add', name: 'Add @' + token.name, attrName: token.name, attrValue: '' }
    return { range, pattern: token.name, items, fallback, completeChars: ':', accept }
  }

  // Values mode: complete against this attribute's existing values; the
  // fallback commits the free text exactly as typed.
  if (HIDDEN_ATTRIBUTE_NAMES.has(token.name)) return undefined
  const values = collectAttributeValues(editor.outline.root.descendants, token.name)
  const items: CompletionItem[] = values.map((value) => ({
    id: 'attr-value:' + value,
    name: value,
    attrName: token.name,
    attrValue: value,
  }))
  if (token.value === '') {
    // `@due:` — nothing typed yet: offer the valueless commit as a plain
    // first row so Return still works with no existing values to list.
    items.unshift({ id: 'attr-set-bare', name: 'Set ' + token.name, attrName: token.name, attrValue: '' })
  }
  return {
    range,
    pattern: token.value,
    items,
    // Escape hatch for the literal typed value; omitted when it IS an
    // existing value (picking that row commits the same thing).
    fallback: values.includes(token.value)
      ? undefined
      : {
          id: 'attr-set',
          name: 'Set ' + token.name + ' = ' + token.value,
          attrName: token.name,
          attrValue: token.value,
        },
    // No completeChars here — `:` must stay typable inside a value
    // (`@due:3:30`). A value pick is terminal whatever key accepted it.
    accept: commit,
  }
}

function collectAttributeNames(rows: { attributes: Record<string, string> }[]): string[] {
  const names = new Set<string>()
  for (const row of rows) {
    for (const name of Object.keys(row.attributes)) {
      if (!HIDDEN_ATTRIBUTE_NAMES.has(name)) names.add(name)
    }
  }
  return [...names].sort()
}

function collectAttributeValues(rows: { attributes: Record<string, string> }[], name: string): string[] {
  const values = new Set<string>()
  for (const row of rows) {
    const value = row.attributes[name]
    if (value) values.add(value)
  }
  return [...values].sort()
}
