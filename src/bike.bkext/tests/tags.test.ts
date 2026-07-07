import { composingTagToken, collectTagNames, handleTagTextInput, provideTagCompletions } from '../app/tags'

const FFFC = '￼'

describe('Tag token grammar', () => {
  it('bare @ is an incomplete token', () => {
    const token = composingTagToken('@', 1)!
    assert.equal(token.name, '')
    assert.equal(JSON.stringify(token.range), JSON.stringify([0, 1]))
    assert.equal(token.isComplete, false)
  })

  it('parses a partial name', () => {
    const token = composingTagToken('@pri', 4)!
    assert.equal(token.name, 'pri')
    assert.equal(JSON.stringify(token.range), JSON.stringify([0, 4]))
    assert.equal(token.isComplete, true)
  })

  it('parses after leading text', () => {
    const token = composingTagToken('call home @priority', 19)!
    assert.equal(token.name, 'priority')
    assert.equal(JSON.stringify(token.range), JSON.stringify([10, 19]))
  })

  it('caret inside the name still finds the whole token', () => {
    const token = composingTagToken('@priority', 4)!
    assert.equal(token.name, 'priority')
    assert.equal(JSON.stringify(token.range), JSON.stringify([0, 9]))
  })

  it('caret outside the token finds nothing', () => {
    assert.equal(composingTagToken('@priority', 0), undefined)
    assert.equal(composingTagToken('@a and more', 6), undefined)
  })

  it('rejects emails and mid-word @', () => {
    assert.equal(composingTagToken('jesse@hogbay.com', 16), undefined)
    assert.equal(composingTagToken('x@a', 3), undefined)
  })

  it('name uses OutlinePath Name grammar', () => {
    const token = composingTagToken('@a.b-c:d_e1', 11)!
    assert.equal(token.name, 'a.b-c:d_e1')
    // Digits cannot start a name — token is just the bare "@".
    assert.equal(composingTagToken('@1st', 4), undefined)
  })

  it('flags reserved names', () => {
    const token = composingTagToken('@indent', 7)!
    assert.equal(token.isReserved, true)
  })

  it('counts graphemes like native character offsets', () => {
    // Emoji (multi-code-unit) before the token must not shift offsets.
    const text = '👨‍👩‍👧 @done'
    const token = composingTagToken(text, 7)!
    assert.equal(token.name, 'done')
    assert.equal(JSON.stringify(token.range), JSON.stringify([2, 7]))
  })

  it('atoms are not word boundaries', () => {
    assert.equal(composingTagToken(`${FFFC}@done`, 6), undefined)
    const token = composingTagToken(`${FFFC} @done`, 7)!
    assert.equal(token.name, 'done')
  })
})

describe('Tag text input handler', () => {
  function makeEditor(text: string) {
    const editor = bike.testEditor()
    const outline = editor.outline
    outline.transaction({ label: 'setup' }, () => {
      outline.insertRows([{ text }], outline.root)
    })
    return { editor, row: outline.root.firstChild! }
  }

  it('space completes a token into a chip and attribute', () => {
    const { editor, row } = makeEditor('@done ')
    const handled = handleTagTextInput({ editor, row, caret: 6, typed: ' ' })
    assert.equal(handled, true)
    assert.equal(row.text.string, `${FFFC} `)
    assert.equal(row.getAttribute('done'), '')
  })

  it('return completes a token at the end of the (split) row', () => {
    const { editor, row } = makeEditor('@due')
    const handled = handleTagTextInput({ editor, row, caret: 4, typed: '\n' })
    assert.equal(handled, true)
    assert.equal(row.text.string, FFFC)
    assert.equal(row.getAttribute('due'), '')
  })

  it('= right after an existing chip opens value editing without inserting', () => {
    const { editor, row } = makeEditor(`${FFFC}=`)
    editor.outline.transaction({ label: 'setup' }, () => {
      row.text.addAttribute('tag', 'due', [0, 1])
      row.setAttribute('due', 'fri')
    })
    const handled = handleTagTextInput({ editor, row, caret: 2, typed: '=' })
    assert.equal(handled, true)
    assert.equal(row.text.string, FFFC)
    assert.equal(row.getAttribute('due'), 'fri')
    // The chip ends up selected (its card opens editing the value).
    assert.equal(editor.selection?.type, 'text')
  })

  it('= completes a token, eats the =, and preserves an existing value', () => {
    const { editor, row } = makeEditor('@due=')
    row.setAttribute('due', 'fri')
    const handled = handleTagTextInput({ editor, row, caret: 5, typed: '=' })
    assert.equal(handled, true)
    assert.equal(row.text.string, FFFC)
    assert.equal(row.getAttribute('due'), 'fri')
  })

  it('ignores ordinary characters, reserved names, and non-tokens', () => {
    const { editor, row } = makeEditor('@don')
    assert.equal(handleTagTextInput({ editor, row, caret: 4, typed: 'e' }), false)

    const reserved = makeEditor('@indent ')
    assert.equal(
      handleTagTextInput({ editor: reserved.editor, row: reserved.row, caret: 8, typed: ' ' }),
      false
    )

    const email = makeEditor('jesse@hogbay.com ')
    assert.equal(
      handleTagTextInput({ editor: email.editor, row: email.row, caret: 17, typed: ' ' }),
      false
    )
  })
})

describe('Tag completion provider', () => {
  function makeTaggedEditor() {
    const editor = bike.testEditor()
    const outline = editor.outline
    outline.transaction({ label: 'setup' }, () => {
      outline.insertRows([{ text: `a ${FFFC}` }, { text: `b ${FFFC}` }, { text: '@d' }], outline.root)
      outline.root.children[0].text.addAttribute('tag', 'priority', [2, 3])
      outline.root.children[1].text.addAttribute('tag', 'done', [2, 3])
    })
    return { editor, row: outline.root.children[2] }
  }

  it('collects distinct sorted tag names from text runs', () => {
    const { editor } = makeTaggedEditor()
    assert.equal(JSON.stringify(collectTagNames(editor.outline)), JSON.stringify(['done', 'priority']))
  })

  it('offers names while typing a token', () => {
    const { editor, row } = makeTaggedEditor()
    const result = provideTagCompletions({ editor, row, caret: 2 })!
    assert.equal(JSON.stringify(result.range), JSON.stringify([0, 2]))
    assert.equal(result.pattern, 'd')
    assert.equal(
      JSON.stringify(result.items.map((item) => item.name)),
      JSON.stringify(['done', 'priority'])
    )
    // "d" fuzzy-matches "done", so no create fallback name conflict — but
    // the typed name "d" is itself new, so a Create Tag fallback exists.
    assert.equal(result.emptyFallback!['create'], true)
  })

  it('accepting an item converts the token to a chip', () => {
    const { editor, row } = makeTaggedEditor()
    const result = provideTagCompletions({ editor, row, caret: 2 })!
    result.accept(result.items[0])
    assert.equal(row.text.string, FFFC)
    assert.equal(row.getAttribute('done'), '')
  })

  it('accepting the create fallback uses the typed name', () => {
    const { editor, row } = makeTaggedEditor()
    const result = provideTagCompletions({ editor, row, caret: 2 })!
    result.accept(result.emptyFallback!)
    assert.equal(row.getAttribute('d'), '')
  })

  it('returns nothing away from a token or mid-token', () => {
    const { editor } = makeTaggedEditor()
    const plain = editor.outline.root.children[0]
    assert.equal(provideTagCompletions({ editor, row: plain, caret: 1 }), undefined)

    const { editor: e2, row } = makeTaggedEditor()
    // Caret mid-token (not at its end) → no popup.
    assert.equal(provideTagCompletions({ editor: e2, row, caret: 1 }), undefined)
  })
})
