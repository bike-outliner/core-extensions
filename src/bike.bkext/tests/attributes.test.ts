import { Image, SymbolConfiguration } from 'bike/app'
import { unclaimedNames } from '../app/default-badge'
import { parseHiddenBadgeAttributes } from '../dom/protocols'

// Attribute editing is the native attribute palette (editor.
// showAttributePalette) and the standalone value picker (editor.showPicker;
// badge menus' "Value…" opens the native equivalent). What's testable from
// JS is the `bike.attribute` registration surface, the presentation
// scheduling, plus the default badge's pure reconciliation.

describe('bike.attribute registration', () => {
    it('registers a minimal definition and disposes it', () => {
        const disposable = bike.attribute('smoke-test-attr', { type: 'text' })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('registers a full definition', () => {
        const disposable = bike.attribute('smoke-test-full', {
            title: 'Smoke',
            type: 'choice',
            choices: [{ name: 'Ay', value: 'a' }, { name: 'Bee', value: 'b', detail: '2nd' }],
            suggestions: (pattern) => (pattern ? [] : [{ name: 'Extra', value: 'a', menu: true }]),
        })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('rejects reserved names', () => {
        assert.throws(() => bike.attribute('indent', { type: 'text' }))
    })

    it('rejects invalid configs', () => {
        // A closed choice needs choices; min must not exceed max.
        assert.throws(() => bike.attribute('smoke-test-bad', { type: 'choice', choices: [] }))
        assert.throws(() => bike.attribute('smoke-test-bad', { type: 'number', min: 10, max: 1 }))
        // An unknown type is a caller error, not a silent fallback to text.
        assert.throws(() => (bike.attribute as any)('smoke-test-bad', { type: 'nope' }))

        // A bare definition with emptyLabel registers fine.
        const disposable = bike.attribute('smoke-test-empty', { type: 'text', emptyLabel: 'Marked' })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })

    it('reports the declared shape via observeAttributes', () => {
        const disposable = bike.attribute('smoke-test-shape', {
            title: 'Shape',
            type: 'duration',
            emptyLabel: 'Some',
            description: 'A shape.',
        })

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const info = latest.find((candidate) => candidate.name === 'smoke-test-shape')
        assert(info, 'registered definition should be reported')
        assert.equal(info!.title, 'Shape')
        assert.equal(info!.type, 'duration')
        assert.equal(info!.emptyLabel, 'Some')
        assert.equal(info!.description, 'A shape.')

        observer.dispose()
        disposable.dispose()
    })

    it('defaults the members a config omits', () => {
        const disposable = bike.attribute('smoke-test-defaults', { type: 'text' })

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const info = latest.find((candidate) => candidate.name === 'smoke-test-defaults')
        assert(info, 'registered definition should be reported')
        assert.equal(info!.title, 'Smoke-test-defaults')
        assert.equal(info!.type, 'text')
        assert.equal(info!.emptyLabel, undefined)
        assert.equal(info!.description, undefined)

        observer.dispose()
        disposable.dispose()
    })

    it('reports a LOSSLESS, defaults-resolved facet per type', () => {
        // Every facet field of the declared type is present with its default
        // filled in, so switching on `type` recovers what was declared.
        const number = bike.attribute('smoke-test-number', { type: 'number', min: 0 })
        const choice = bike.attribute('smoke-test-choice', { type: 'choice', choices: [{ name: 'Ay', value: 'a' }] })
        const date = bike.attribute('smoke-test-date', { type: 'date' })

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const byName = new Map(latest.map((info) => [info.name, info]))

        const numberInfo = byName.get('smoke-test-number')!
        assert.equal(numberInfo.type, 'number')
        assert.equal((numberInfo as any).min, 0)
        assert.equal((numberInfo as any).step, 1, 'step defaults to 1')
        assert.equal((numberInfo as any).integer, false)

        const choiceInfo = byName.get('smoke-test-choice')!
        assert.equal((choiceInfo as any).choices[0].name, 'Ay')
        assert.equal((choiceInfo as any).choices[0].value, 'a')
        assert.equal((choiceInfo as any).open, false)

        assert.equal((byName.get('smoke-test-date')! as any).time, 'optional')

        observer.dispose()
        for (const d of [number, choice, date]) d.dispose()
    })

    it('accepts defaultBadge: false and reports it via observeAttributes', () => {
        const disposable = bike.attribute('smoke-test-owned', { type: 'text', defaultBadge: false })

        let snapshots: { name: string; defaultBadge: boolean }[][] = []
        const observer = bike.observeAttributes((infos) => snapshots.push(infos))
        assert.equal(snapshots.length, 1, 'observe should emit immediately')
        const owned = snapshots[0].find((info) => info.name === 'smoke-test-owned')
        assert(owned, 'registered definition should be reported')
        assert.equal(owned!.defaultBadge, false)
        // Core definitions report too, with their explicit flags.
        const status = snapshots[0].find((info) => info.name === 'status')
        assert(status, 'status definition should be reported')
        assert.equal(status!.defaultBadge, false)

        disposable.dispose()
        assert(snapshots.length >= 2, 'disposal should re-emit')
        const latest = snapshots[snapshots.length - 1]
        assert(!latest.some((info) => info.name === 'smoke-test-owned'), 'disposed definition should vanish')

        observer.dispose()
        const countAfterDispose = snapshots.length
        const tempDisposable = bike.attribute('smoke-test-after', { type: 'text' })
        tempDisposable.dispose()
        assert.equal(snapshots.length, countAfterDispose, 'disposed observer should stop emitting')
    })

    it('round-trips metadata verbatim, defaulting to {}', () => {
        // Opaque to the host: whatever JSON went in comes back out, so a
        // consumer can key its own policy off it (the calendar reads
        // `calendar: false`) without this API growing a field per consumer.
        const tagged = bike.attribute('smoke-test-meta', {
            type: 'text',
            metadata: { calendar: false, nested: { list: [1, 'two', true] } },
        })
        const bare = bike.attribute('smoke-test-nometa', { type: 'text' })

        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const byName = new Map(latest.map((info) => [info.name, info]))

        const metadata = byName.get('smoke-test-meta')!.metadata
        assert.equal(metadata['calendar'], false)
        assert.equal(JSON.stringify(metadata['nested']), JSON.stringify({ list: [1, 'two', true] }))
        assert.equal(
            JSON.stringify(byName.get('smoke-test-nometa')!.metadata),
            '{}',
            'absent metadata resolves to {}'
        )

        // Core's `status` carries the calendar opt-out.
        assert.equal(byName.get('status')!.metadata['calendar'], false)

        observer.dispose()
        tagged.dispose()
        bare.dispose()
    })

    it('rejects non-object metadata', () => {
        assert.throws(() => (bike.attribute as any)('smoke-test-badmeta', { metadata: 'nope' }))
        assert.throws(() => (bike.attribute as any)('smoke-test-badmeta', { metadata: [1, 2] }))
    })
})

describe('bike.parseAttribute', () => {
    it('parses natively, per the declared type', () => {
        // No `parse` callback anywhere: the TYPE is what parses.
        const disposable = bike.attribute('smoke-test-parse', {
            type: 'choice',
            choices: [{ name: 'Okay', value: 'ok' }],
        })
        // A choice matches by name OR value, and reports the display name.
        const parsed = bike.parseAttribute('smoke-test-parse', 'Okay')
        assert.equal(parsed?.value, 'ok')
        assert.equal(parsed?.label, 'Okay')
        // A closed choice rejects anything else.
        assert.equal(bike.parseAttribute('smoke-test-parse', 'nope'), undefined)
        disposable.dispose()
    })

    it('is undefined for unknown attributes', () => {
        assert.equal(bike.parseAttribute('smoke-test-unknown', 'x'), undefined)
    })

    it('parses a bare type with default facets, the mirror of displayValue', () => {
        // No registered attribute involved — the TYPE parses. This is what a
        // client rolling its own multi-value attribute splits and calls per
        // item, so each item still resolves natively.
        assert.equal(bike.parseValue('duration', '90m')?.value, 'PT1H30M')
        assert.equal(bike.parseValue('duration', '2h 30m')?.value, 'PT2H30M')
        assert.equal(bike.parseValue('boolean', 'yes')?.value, 'true')
        assert(bike.parseValue('date', 'today')?.value.match(/^\d{4}-\d{2}-\d{2}$/))
        // Round-trips through displayValue.
        const parsed = bike.parseValue('duration', '1.5h')!
        assert.equal(bike.displayValue('duration', parsed.value), parsed.label)
        // An unknown type and unresolvable text are both undefined.
        assert.equal(bike.parseValue('nope' as any, 'x'), undefined)
        assert.equal(bike.parseValue('duration', 'lots'), undefined)
    })

    it('resolves dates through the core due definition', () => {
        assert.equal(bike.parseAttribute('due', '2030-01-02')?.value, '2030-01-02')
        // Natural language, natively — no extension code involved.
        assert(bike.parseAttribute('due', 'today')?.value.match(/^\d{4}-\d{2}-\d{2}$/))
        assert(bike.parseAttribute('due', 'next fri')?.value.match(/^\d{4}-\d{2}-\d{2}$/))
        // "soon" is not a date — the valueless due is committed by the
        // palette's `""` row and the menu's "Soon" pick, not by parsing.
        assert.equal(bike.parseAttribute('due', 'soon'), undefined)
    })

    it('resolves choices through the core priority definition', () => {
        assert.equal(bike.parseAttribute('priority', '1')?.value, '1')
        assert.equal(bike.parseAttribute('priority', 'nope'), undefined)
    })
})

describe('bike.displayAttribute / displayValue', () => {
    it('formats through the named attribute definition', () => {
        // The wire value is ISO; the label is human and locale-aware.
        assert.equal(bike.displayAttribute('estimate', 'PT1H30M'), bike.displayValue('duration', 'PT1H30M'))
        assert(bike.displayAttribute('estimate', 'PT1H30M').length > 0)
        // A value that doesn't parse falls back to the raw wire string.
        assert.equal(bike.displayAttribute('estimate', '90m'), '90m')
        // An unknown attribute falls back too.
        assert.equal(bike.displayAttribute('smoke-test-unknown', 'x'), 'x')
    })

    it('formats a bare type with default facets', () => {
        assert.equal(bike.displayValue('nope' as any, 'x'), 'x')
        assert.equal(bike.displayValue('boolean', 'true').length > 0, true)
    })
})

describe('default attribute set', () => {
    it('registers the shared shapes', () => {
        let latest: import('bike/app').AttributeInfo[] = []
        const observer = bike.observeAttributes((infos) => (latest = infos))
        const byName = new Map(latest.map((info) => [info.name, info]))

        assert.equal(byName.get('status')?.type, 'choice')
        assert.equal(byName.get('status')?.defaultBadge, false)
        assert.equal(byName.get('due')?.type, 'date')
        assert.equal(byName.get('due')?.defaultBadge, false)
        assert.equal(byName.get('due')?.emptyLabel, 'Soon')
        // priority is a closed set — a choice, not a number.
        assert.equal(byName.get('priority')?.type, 'choice')
        assert.equal((byName.get('priority')! as any).choices.map((c: any) => c.value).join(','), '1,2,3')
        // The calendar shows every `date` attribute; the log's opts out (a
        // completion stamp is history, not schedule), due doesn't. Done also
        // opts out of the context menu's attribute group — Toggle Done owns it.
        assert.equal(byName.get('status')?.metadata['calendar'], false)
        assert.equal(byName.get('status')?.metadata['contextMenu'], false)
        assert.equal(byName.get('log-date')?.metadata['calendar'], false)
        assert.equal(byName.get('clock-duration')?.metadata['calendar'], false)
        // Namespaced so a log entry's recorded state can never be read as a
        // task's own — the collision that made stale entries render as done.
        assert.equal(byName.get('log-status')?.type, 'choice')
        assert.equal(byName.get('log-status')?.defaultBadge, false)
        assert.equal(byName.get('due')?.metadata['calendar'], undefined)
        assert.equal(byName.get('estimate')?.type, 'duration')
        // flagged is a closed set of the seven Mail colors, in Mail's order,
        // presented by its own badge.
        assert.equal(byName.get('flagged')?.type, 'choice')
        assert.equal(
            (byName.get('flagged')! as any).choices.map((c: any) => c.value).join(','),
            'orange,red,purple,blue,yellow,green,gray'
        )
        assert.equal((byName.get('flagged')! as any).choices[0].name, 'Orange')
        assert.equal((byName.get('flagged')! as any).open, false)
        assert.equal(byName.get('flagged')?.defaultBadge, false)
        // A bare `@flagged` predates the colors and stays meaningful.
        assert.equal(byName.get('flagged')?.emptyLabel, 'Flagged')

        observer.dispose()
    })

    it('resolves flag colors by name or value, and rejects others', () => {
        // A choice matches the display NAME as well as the wire value.
        assert.equal(bike.parseAttribute('flagged', 'Red')?.value, 'red')
        assert.equal(bike.parseAttribute('flagged', 'red')?.value, 'red')
        assert.equal(bike.parseAttribute('flagged', 'gray')?.label, 'Gray')
        // Closed: nothing outside the seven resolves.
        assert.equal(bike.parseAttribute('flagged', 'chartreuse'), undefined)
    })

    it('resolves estimate durations to ISO wire values', () => {
        // The old `<n><unit>` spelling still TYPES the same; what changed is
        // what gets stored.
        assert.equal(bike.parseAttribute('estimate', '90')?.value, 'PT1H30M')
        assert.equal(bike.parseAttribute('estimate', '90m')?.value, 'PT1H30M')
        assert.equal(bike.parseAttribute('estimate', '1.5h')?.value, 'PT1H30M')
        assert.equal(bike.parseAttribute('estimate', '2h 30m')?.value, 'PT2H30M')
        assert.equal(bike.parseAttribute('estimate', 'lots'), undefined)
    })
})

describe('default badge names', () => {
    const none = new Set<string>()

    it('sorts unclaimed names from the values map', () => {
        const names = unclaimedNames({ foo: 'x', bar: '' }, none, none)
        assert.equal(names.join(','), 'bar,foo')
    })

    it('skips claimed names', () => {
        const names = unclaimedNames({ foo: 'x', due: '2026-01-01', priority: '2' }, new Set(['due', 'priority']), none)
        assert.equal(names.join(','), 'foo')
    })

    it('empty map or all-claimed yields nothing', () => {
        assert.equal(unclaimedNames({}, none, none).length, 0)
        assert.equal(unclaimedNames({ due: '1' }, new Set(['due']), none).length, 0)
    })

    it('skips names the user hid', () => {
        const names = unclaimedNames({ foo: 'x', syncid: 'a1', reviewer: 'kim' }, none, new Set(['syncid']))
        assert.equal(names.join(','), 'foo,reviewer')
    })

    it('hiding every attribute yields nothing, so no badge is drawn', () => {
        assert.equal(unclaimedNames({ syncid: 'a1' }, none, new Set(['syncid'])).length, 0)
    })
})

describe('hidden badge attribute parsing', () => {
    it('splits on commas and trims', () => {
        const hidden = parseHiddenBadgeAttributes('syncid, x-tool-hash ,reviewer')
        assert.equal([...hidden].sort().join(','), 'reviewer,syncid,x-tool-hash')
    })

    it('tolerates a leading @, newlines, and empty entries', () => {
        const hidden = parseHiddenBadgeAttributes('@syncid,,\n  @x-hash , ')
        assert.equal([...hidden].sort().join(','), 'syncid,x-hash')
    })

    it('empty, blank, and non-string values yield nothing', () => {
        assert.equal(parseHiddenBadgeAttributes('').size, 0)
        assert.equal(parseHiddenBadgeAttributes('  , ,').size, 0)
        assert.equal(parseHiddenBadgeAttributes(undefined).size, 0)
        assert.equal(parseHiddenBadgeAttributes(42).size, 0)
    })
})

describe('default badge registration', () => {
    it('registers a keyed multi-image badge with default inputs', () => {
        // The API accepts inputs 'rowAttributes' + a keyed render; disposal deregisters.
        const disposable = bike.badge('smoke-multi', {
            where: '.*',
            inputs: 'rowAttributes',
            render: (values) =>
                Object.keys(values)
                    .sort()
                    .map((name) => ({ key: name, image: Image.fromSymbol(new SymbolConfiguration('circle')) })),
        })
        assert(disposable, 'registration should return a Disposable')
        disposable.dispose()
    })
})

describe('attribute palette', () => {
    it('showAttributePalette is callable (headless: schedules, no panel)', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [row] = outline.insertRows(['Buy milk'], outline.root)
        editor.showAttributePalette(row)
    })
})

describe('value picker (showPicker)', () => {
    it('presents attribute-bound (headless: schedules, no panel)', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [row] = outline.insertRows(['Buy milk'], outline.root)
        editor.showPicker({ row }, { source: { attribute: 'foo' }, onAccept() {} })
    })

    it('presents a list-described suggestion shell', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [row] = outline.insertRows(['Buy milk'], outline.root)
        editor.showPicker({ row }, {
            source: {
                values: [{ name: 'Alpha', value: 'a' }],
                parse: (text: string) => (text === 'ok' ? { value: 'ok', label: 'OK' } : undefined),
            },
            onAccept() {},
        })
    })

    it('rejects nothing-to-show options', () => {
        const editor = bike.testEditor()
        const outline = editor.outline
        const [row] = outline.insertRows(['Buy milk'], outline.root)
        // No attribute, kind, values, or parse — a caller error.
        assert.throws(() => (editor.showPicker as any)({ row }, { onAccept() {} }))
    })

    it('presents with NO placement, centered — no row required', () => {
        // The case a row-anchored picker couldn't serve: an outline with no
        // rows at all still gets a picker.
        const editor = bike.testEditor()
        editor.showPicker({ kind: 'date', onAccept() {} })
    })
})
