import { Image, SymbolConfiguration } from 'bike/app'
import { appendAttributeToken, badgeMenuItems, unclaimedNames } from '../app/attributes'

// Attribute completion moved native at bikeAPIVersion 0.50.0 — the token
// grammar, popup fan-out, and commit are covered by Swift tests
// (OutlineEditorTests/AttributeCompletionTests). What's testable from JS is
// the `bike.attribute` registration surface, plus the catch-all badge's
// pure reconciliation.

describe('bike.attribute registration', () => {
    it('registers a minimal definition and disposes it', () => {
        const disposable = bike.attribute('smoke-test-attr', {})
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('registers a full definition', () => {
        const disposable = bike.attribute('smoke-test-full', {
            title: 'Smoke',
            sigil: '~',
            shortcuts: () => [{ name: 'Smoke Now', value: 'now' }],
            values: (pattern) => (pattern ? [] : [{ name: 'A', value: 'a' }]),
            parse: (text) => (text === 'ok' ? { value: 'ok', label: 'OK' } : undefined),
        })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('rejects reserved names', () => {
        assert.throws(() => bike.attribute('indent', {}))
    })

    it('rejects invalid sigils', () => {
        assert.throws(() => bike.attribute('smoke-test-sigil', { sigil: 'x' }))
        assert.throws(() => bike.attribute('smoke-test-sigil', { sigil: '@' }))
        assert.throws(() => bike.attribute('smoke-test-sigil', { sigil: '::' }))
    })

    it('rejects an unknown type', () => {
        assert.throws(() => bike.attribute('smoke-test-type', { type: 'datetime' as any }))
    })

    it('rejects a flag with a value vocabulary', () => {
        assert.throws(() => bike.attribute('smoke-test-flag', { type: 'flag', standardValues: [{ name: 'x', value: 'x' }] }))
        assert.throws(() => bike.attribute('smoke-test-flag', { type: 'flag', values: () => [] }))
        assert.throws(() => bike.attribute('smoke-test-flag', { type: 'flag', parse: () => undefined }))
        assert.throws(() => bike.attribute('smoke-test-flag', { type: 'flag', list: true }))
        // A bare flag (shortcuts and emptyLabel allowed) registers fine.
        const disposable = bike.attribute('smoke-test-flag', { type: 'flag', emptyLabel: 'Flagged' })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('reports the declared shape via observeAttributes', () => {
        const disposable = bike.attribute('smoke-test-shape', {
            title: 'Shape',
            type: 'duration',
            strict: true,
            list: true,
            emptyLabel: 'Some',
            description: 'A shape.',
        })

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const info = latest.find((candidate) => candidate.name === 'smoke-test-shape')
        assert(info, 'registered definition should be reported')
        assert.equal(info!.title, 'Shape')
        assert.equal(info!.type, 'duration')
        assert.equal(info!.strict, true)
        assert.equal(info!.list, true)
        assert.equal(info!.emptyLabel, 'Some')
        assert.equal(info!.description, 'A shape.')

        observer.dispose()
        disposable.dispose()
    })

    it('defaults the declared shape', () => {
        const disposable = bike.attribute('smoke-test-defaults', {})

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const info = latest.find((candidate) => candidate.name === 'smoke-test-defaults')
        assert(info, 'registered definition should be reported')
        assert.equal(info!.title, 'Smoke-test-defaults')
        assert.equal(info!.type, 'string')
        assert.equal(info!.strict, false)
        assert.equal(info!.list, false)
        assert.equal(info!.emptyLabel, undefined)
        assert.equal(info!.description, undefined)

        observer.dispose()
        disposable.dispose()
    })

    it('accepts standardValues and reports them via observeAttributes', () => {
        const disposable = bike.attribute('smoke-test-standard', {
            standardValues: [
                { name: 'Low', value: '1' },
                { name: 'High', value: '2' },
            ],
        })

        let latest: { name: string; standardValues: { name: string; value: string }[] }[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const info = latest.find((candidate) => candidate.name === 'smoke-test-standard')
        assert(info, 'registered definition should be reported')
        assert.equal(info!.standardValues.map((v) => `${v.name}=${v.value}`).join(','), 'Low=1,High=2')
        // Definitions without standard values report an empty array.
        const done = latest.find((candidate) => candidate.name === 'done')
        assert.equal(done!.standardValues.length, 0)
        // The core status definition ships its canonical set.
        const status = latest.find((candidate) => candidate.name === 'status')
        assert.equal(status!.standardValues.map((v) => v.value).join(','), 'todo,doing,review')

        observer.dispose()
        disposable.dispose()
    })

    it('accepts defaultBadge: false and reports it via observeAttributes', () => {
        const disposable = bike.attribute('smoke-test-owned', { defaultBadge: false })

        let snapshots: { name: string; defaultBadge: boolean }[][] = []
        const observer = bike.observeAttributes((infos) => snapshots.push(infos))
        assert.equal(snapshots.length, 1, 'observe should emit immediately')
        const owned = snapshots[0].find((info) => info.name === 'smoke-test-owned')
        assert(owned, 'registered definition should be reported')
        assert.equal(owned!.defaultBadge, false)
        // Core definitions report too, with their explicit flags.
        const done = snapshots[0].find((info) => info.name === 'done')
        assert(done, 'done definition should be reported')
        assert.equal(done!.defaultBadge, false)

        disposable.dispose()
        assert(snapshots.length >= 2, 'disposal should re-emit')
        const latest = snapshots[snapshots.length - 1]
        assert(!latest.some((info) => info.name === 'smoke-test-owned'), 'disposed definition should vanish')

        observer.dispose()
        const countAfterDispose = snapshots.length
        const tempDisposable = bike.attribute('smoke-test-after', {})
        tempDisposable.dispose()
        assert.equal(snapshots.length, countAfterDispose, 'disposed observer should stop emitting')
    })
})

describe('bike.parseAttribute', () => {
    it('parses through the owning definition', () => {
        const disposable = bike.attribute('smoke-test-parse', {
            parse: (text) => (text === 'ok' ? { value: 'v', label: 'OK' } : undefined),
        })
        const parsed = bike.parseAttribute('smoke-test-parse', 'ok')
        assert.equal(parsed?.value, 'v')
        assert.equal(parsed?.label, 'OK')
        assert.equal(bike.parseAttribute('smoke-test-parse', 'nope'), undefined)
        disposable.dispose()
    })

    it('is undefined for unknown or parseless attributes', () => {
        assert.equal(bike.parseAttribute('smoke-test-unknown', 'x'), undefined)
        // status registers no parse.
        assert.equal(bike.parseAttribute('status', 'todo'), undefined)
    })

    it('resolves dates through the core due definition', () => {
        const parsed = bike.parseAttribute('due', '2030-01-02')
        assert.equal(parsed?.value, '2030-01-02')
        const soon = bike.parseAttribute('due', 'soon')
        assert.equal(soon?.value, '')
        assert.equal(soon?.label, 'Soon')
    })
})

describe('default attribute set', () => {
    it('registers the shared shapes', () => {
        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const byName = new Map(latest.map((info) => [info.name, info]))

        assert.equal(byName.get('done')?.type, 'date')
        assert.equal(byName.get('done')?.defaultBadge, false)
        assert.equal(byName.get('done')?.emptyLabel, 'Done')
        assert.equal(byName.get('due')?.type, 'date')
        assert.equal(byName.get('due')?.defaultBadge, false)
        assert.equal(byName.get('due')?.emptyLabel, 'Soon')
        assert.equal(byName.get('priority')?.type, 'number')
        assert.equal(byName.get('priority')?.strict, true)
        assert.equal(byName.get('status')?.type, 'string')
        assert.equal(byName.get('status')?.strict, true)
        assert.equal(byName.get('start')?.type, 'date')
        assert.equal(byName.get('estimate')?.type, 'duration')
        assert.equal(byName.get('flagged')?.type, 'flag')
        assert.equal(byName.get('flagged')?.emptyLabel, 'Flagged')

        observer.dispose()
    })

    it('resolves estimate durations', () => {
        assert.equal(bike.parseAttribute('estimate', '90')?.value, '90m')
        assert.equal(bike.parseAttribute('estimate', '1.5h')?.value, '1.5h')
        assert.equal(bike.parseAttribute('estimate', 'lots'), undefined)
    })
})

describe('catch-all badge names', () => {
    it('sorts unclaimed names from the values map', () => {
        const names = unclaimedNames({ foo: 'x', bar: '' }, new Set())
        assert.equal(names.join(','), 'bar,foo')
    })

    it('skips claimed names', () => {
        const names = unclaimedNames({ foo: 'x', due: '2026-01-01', priority: '2' }, new Set(['due', 'priority']))
        assert.equal(names.join(','), 'foo')
    })

    it('empty map or all-claimed yields nothing', () => {
        assert.equal(unclaimedNames({}, new Set()).length, 0)
        assert.equal(unclaimedNames({ due: '1' }, new Set(['due'])).length, 0)
    })

    it('registers a keyed multi-image badge with catch-all inputs', () => {
        // The API accepts inputs '*' + a keyed render; disposal deregisters.
        const disposable = bike.badge('smoke-multi', {
            where: '.*',
            inputs: '*',
            render: (values) =>
                Object.keys(values)
                    .sort()
                    .map((name) => ({ key: name, image: Image.fromSymbol(new SymbolConfiguration('circle')) })),
        })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })
})

describe('badge menu', () => {
    it('builds filter / filter-value / edit / remove with separators', () => {
        const items = badgeMenuItems('foo', 'bar')
        const shape = items.map((item) => (item.type === 'separator' ? '|' : (item as any).title))
        assert.equal(shape.join(','), 'Filter @foo,Filter @foo = bar,|,Edit @foo,|,Remove @foo')
    })

    it('omits the value row for valueless attributes', () => {
        const items = badgeMenuItems('waiting', '')
        const shape = items.map((item) => (item.type === 'separator' ? '|' : (item as any).title))
        assert.equal(shape.join(','), 'Filter @waiting,|,Edit @waiting,|,Remove @waiting')
    })

    it('inserts standard-value pick rows above Edit, current value checked', () => {
        const standards = [
            { name: '1', value: '1' },
            { name: '2', value: '2' },
            { name: '3', value: '3' },
        ]
        const items = badgeMenuItems('priority', '2', standards)
        const shape = items.map((item) =>
            item.type === 'separator' ? '|' : `${(item as any).title}${(item as any).state === 'on' ? '*' : ''}`
        )
        assert.equal(
            shape.join(','),
            'Filter @priority,Filter @priority = 2,|,1,2*,3,|,Edit @priority,|,Remove @priority'
        )
        assert.equal((items.find((item) => (item as any).state === 'on') as any).id, 'set:2')
    })

    it('truncates long values in the filter-value title', () => {
        const items = badgeMenuItems('notes', 'a really long value that keeps going')
        const title = (items[1] as any).title as string
        assert(title.endsWith('…'), 'long values should truncate: ' + title)
    })

    it('appendAttributeToken stages the edit flow with a boundary space', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [row] = outline.insertRows(['Buy milk'], outline.root)

        appendAttributeToken(editor, row, 'foo')
        assert.equal(row.text.string, 'Buy milk @foo:')
        assert.equal(editor.selection?.type, 'caret')
        // Caret at end of text — the completion grammar's requirement.
        assert.equal((editor.selection as any).detail.char, row.text.count)

        // showCompletions is callable (headless: schedules, no popup).
        editor.showCompletions()
    })

    it('appendAttributeToken skips the space when the boundary exists', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [empty] = outline.insertRows([''], outline.root)
        appendAttributeToken(editor, empty, 'foo')
        assert.equal(empty.text.string, '@foo:')

        const [spaced] = outline.insertRows(['Buy milk '], outline.root)
        appendAttributeToken(editor, spaced, 'foo')
        assert.equal(spaced.text.string, 'Buy milk @foo:')
    })
})
