import { parseAttributeToken, provideAttributeCompletions } from '../app/attributes'
import { CompletionResult, Row } from 'bike/app'

describe('parseAttributeToken', () => {
    it('requires the caret at end of text', () => {
        assert.equal(parseAttributeToken('@due', 2), undefined)
        assert(parseAttributeToken('@due', 4), 'end-of-text caret should parse')
    })

    it('parses a bare @ (empty name) so the popup can list every name', () => {
        const token = parseAttributeToken('Buy milk @', 10)!
        assert(token, 'bare @ should be live')
        assert.equal(token.start, 9)
        assert.equal(token.name, '')
        assert.equal(token.value, undefined)
    })

    it('parses a name-only token', () => {
        const token = parseAttributeToken('Buy milk @due', 13)!
        assert.equal(token.start, 9)
        assert.equal(token.name, 'due')
        assert.equal(token.value, undefined)
    })

    it('parses name:value, value may contain spaces', () => {
        const token = parseAttributeToken('Buy milk @due:next fri', 22)!
        assert.equal(token.name, 'due')
        assert.equal(token.value, 'next fri')
    })

    it('parses an empty value (@name:)', () => {
        const token = parseAttributeToken('x @due:', 7)!
        assert.equal(token.name, 'due')
        assert.equal(token.value, '')
    })

    it('allows a token at the start of text', () => {
        const token = parseAttributeToken('@done', 5)!
        assert.equal(token.start, 0)
        assert.equal(token.name, 'done')
    })

    it('requires whitespace before the @ — emails never fire', () => {
        assert.equal(parseAttributeToken('jesse@hogbaysoftware.com', 24), undefined)
    })

    it('dies when prose makes the name invalid', () => {
        // The space after `jesse` invalidates the name part.
        assert.equal(parseAttributeToken('ping @jesse then more', 21), undefined)
    })

    it('rejects a colon with no name', () => {
        assert.equal(parseAttributeToken('x @:value', 9), undefined)
    })

    it('keeps a value containing @ inside one token', () => {
        const token = parseAttributeToken('@email:foo@bar.com', 18)!
        assert.equal(token.name, 'email')
        assert.equal(token.value, 'foo@bar.com')
    })

    it('a later space-preceded @ starts a new token', () => {
        const token = parseAttributeToken('x @email:a b @p2', 16)!
        assert.equal(token.start, 13)
        assert.equal(token.name, 'p2')
    })

    it('rejects names that are not bare identifiers', () => {
        assert.equal(parseAttributeToken('x @2day', 7), undefined)
        assert.equal(parseAttributeToken('x @a b', 6), undefined)
        assert(parseAttributeToken('x @a-b_2', 8), 'dash/underscore/digits are fine after a letter')
    })
})

describe('attribute completions provider', () => {
    // Drive the provider directly with a real editor: seed rows with
    // attributes, put the caret after a typed token, and check the
    // CompletionResult the popup would show — then accept and check the
    // terminal commit (token erased + attribute set, one undo step).
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: 'setup' }, () => {
        outline.insertRows(
            [{ text: 'Existing', attributes: { due: '2026-01-01', priority: '2', done: '' } }],
            outline.root
        )
    })

    function complete(text: string): { row: Row; result: CompletionResult | undefined } {
        let row!: Row
        outline.transaction({ label: 'type' }, () => {
            ;[row] = outline.insertRows([text], outline.root)
        })
        editor.selectText(row, text.length)
        return { row, result: provideAttributeCompletions({ editor, row, caret: text.length }) }
    }

    it('offers no completions without a live token', () => {
        assert.equal(complete('plain prose').result, undefined)
        assert.equal(complete('jesse@hogbaysoftware.com').result, undefined)
        assert.equal(complete('ping @jesse then more').result, undefined)
    })

    it('bare @ lists names used in the outline, hidden names excluded', () => {
        const { result } = complete('Buy milk @')
        assert(result, 'bare @ should complete')
        assert.equal(result!.pattern, '')
        const names = result!.items.map((item) => item.name)
        assert(names.includes('due'), 'due should be listed')
        assert(names.includes('priority'), 'priority should be listed')
        assert(names.includes('done'), 'done should be listed')
        assert(!names.includes('indent'), 'hidden names never offered')
        // Ids are prefixed so a fully-typed name still shows its popup row.
        assert(result!.items.every((item) => item.id !== item.name))
    })

    it('name mode offers an Add fallback for new names', () => {
        const { result } = complete('Buy milk @foo')
        assert(result, 'should complete')
        assert.equal(result!.pattern, 'foo')
        assert.equal(result!.fallback?.name, 'Add @foo')
    })

    it('value mode lists existing values and a Set fallback', () => {
        const { result } = complete('Buy milk @due:tomor')
        assert(result, 'should complete')
        assert.equal(result!.pattern, 'tomor')
        const names = result!.items.map((item) => item.name)
        assert(names.includes('2026-01-01'), 'existing due value should be listed')
        assert.equal(result!.fallback?.name, 'Set due = tomor')
    })

    it('empty value offers a bare Set row so @name:⏎ works', () => {
        const { result } = complete('Buy milk @due:')
        assert(result, 'should complete')
        assert.equal(result!.items[0].name, 'Set due')
    })

    it('hidden names never reach value mode', () => {
        assert.equal(complete('x @indent:2').result, undefined)
    })

    it('accept erases the token plus its leading space and sets the attribute', () => {
        const { row, result } = complete('Buy milk @foo:next fri')
        const fallback = result!.fallback!
        result!.accept(fallback, 'pick')
        assert.equal(row.text.string, 'Buy milk')
        assert.equal(row.getAttribute('foo'), 'next fri')
    })

    it('picking a name row commits it valueless', () => {
        const { row, result } = complete('Call bank @done')
        const item = result!.items.find((candidate) => candidate.name === 'done')!
        result!.accept(item, 'pick')
        assert.equal(row.text.string, 'Call bank')
        assert.equal(row.getAttribute('done'), '')
    })

    it('a token at the start of text erases cleanly (no leading space)', () => {
        const { row, result } = complete('@foo:bar')
        result!.accept(result!.fallback!, 'pick')
        assert.equal(row.text.string, '')
        assert.equal(row.getAttribute('foo'), 'bar')
    })

    it('names mode declares : as a complete character; values mode does not', () => {
        assert.equal(complete('x @pri').result!.completeChars, ':')
        assert.equal(complete('x @due:tom').result!.completeChars, undefined)
    })

    it('completing a name expands the token to @name: and commits nothing', () => {
        const { row, result } = complete('Buy milk @pri')
        const item = result!.items.find((candidate) => candidate.name === 'priority')!
        result!.accept(item, 'complete')
        assert.equal(row.text.string, 'Buy milk @priority:')
        assert.equal(row.getAttribute('priority'), undefined, 'complete must not commit')
        // The re-query at the new caret lands in values mode for priority.
        const followUp = provideAttributeCompletions({ editor, row, caret: row.text.count })
        assert(followUp, 'expanded token should complete again')
        assert.equal(followUp!.pattern, '')
        assert(
            followUp!.items.some((candidate) => candidate.name === '2'),
            'existing priority value should be listed'
        )
    })

    it('completing the Add fallback expands the typed new name', () => {
        const { row, result } = complete('Buy milk @proj')
        result!.accept(result!.fallback!, 'complete')
        assert.equal(row.text.string, 'Buy milk @proj:')
        assert.equal(row.getAttribute('proj'), undefined)
    })

    it('a value accept is terminal regardless of kind', () => {
        const { row, result } = complete('x @foo2:bar')
        result!.accept(result!.fallback!, 'complete')
        assert.equal(row.text.string, 'x')
        assert.equal(row.getAttribute('foo2'), 'bar')
    })

    it('the escape hatch: fallback is present even while names match', () => {
        const { result } = complete('x @pri')
        assert(
            result!.items.some((candidate) => candidate.name === 'priority'),
            'priority should still match'
        )
        assert.equal(result!.fallback?.name, 'Add @pri', 'fallback should coexist with matches')
    })

    it('accepting the fallback while matches exist creates the literal name', () => {
        const { row, result } = complete('x @pri')
        result!.accept(result!.fallback!, 'pick')
        assert.equal(row.text.string, 'x')
        assert.equal(row.getAttribute('pri'), '', 'literal pri, not priority')
        assert.equal(row.getAttribute('priority'), undefined)
    })

    it('no fallback when the typed name is an existing one', () => {
        const { result } = complete('x @priority')
        assert(
            result!.items.some((candidate) => candidate.name === 'priority'),
            'the exact name still matches'
        )
        assert.equal(result!.fallback, undefined, 'escape would duplicate the match')
    })

    it('no fallback when the typed value is an existing one', () => {
        const { result } = complete('x @due:2026-01-01')
        assert(
            result!.items.some((candidate) => candidate.name === '2026-01-01'),
            'the exact value still matches'
        )
        assert.equal(result!.fallback, undefined)
    })
})
