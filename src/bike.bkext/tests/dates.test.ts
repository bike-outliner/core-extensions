import { dateSuggestions, dayKey, parseDateInput, parseDurationAttribute } from '../app/dates'

describe('parseDateInput', () => {
    // Tuesday, July 21 2026 — a fixed local `now` so weekday math is stable.
    const now = new Date(2026, 6, 21, 14, 30)

    function day(text: string): string | null {
        const parsed = parseDateInput(text, now)
        return parsed === null ? null : dayKey(parsed)
    }

    it('parses today / tomorrow / yesterday keywords and abbreviations', () => {
        assert.equal(day('today'), '2026-07-21')
        assert.equal(day('tod'), '2026-07-21')
        assert.equal(day('tomorrow'), '2026-07-22')
        assert.equal(day('tom'), '2026-07-22')
        assert.equal(day('yesterday'), '2026-07-20')
    })

    it('parses weekday names and unique prefixes as the NEXT occurrence', () => {
        assert.equal(day('friday'), '2026-07-24')
        assert.equal(day('fri'), '2026-07-24')
        assert.equal(day('fr'), '2026-07-24')
        // Today is Tuesday: a weekday never resolves to today.
        assert.equal(day('tuesday'), '2026-07-28')
        assert.equal(day('wed'), '2026-07-22')
    })

    it('next <weekday> is the occurrence after next', () => {
        assert.equal(day('next fri'), '2026-07-31')
        assert.equal(day('next tuesday'), '2026-08-04')
    })

    it('rejects ambiguous or too-short weekday prefixes', () => {
        assert.equal(parseDateInput('s', now), null)
        assert.equal(parseDateInput('t', now), null)
        // 'su' sunday vs 'sa' saturday are unique; bare 's' is not.
        assert.equal(day('su'), '2026-07-26')
        assert.equal(day('sa'), '2026-07-25')
    })

    it('parses +Nd / +Nw offsets', () => {
        assert.equal(day('+3d'), '2026-07-24')
        assert.equal(day('+2w'), '2026-08-04')
        assert.equal(day('+0d'), '2026-07-21')
    })

    it('parses YYYY-MM-DD as local components', () => {
        assert.equal(day('2026-08-01'), '2026-08-01')
        assert.equal(parseDateInput('2026-13-01', now), null)
        assert.equal(parseDateInput('2026-01-42', now), null)
    })

    it('trims and lowercases', () => {
        assert.equal(day('  Friday  '), '2026-07-24')
        assert.equal(day('NEXT FRI'), '2026-07-31')
    })

    it('rejects garbage', () => {
        assert.equal(parseDateInput('', now), null)
        assert.equal(parseDateInput('xyzzy', now), null)
        assert.equal(parseDateInput('next', now), null)
        assert.equal(parseDateInput('+3x', now), null)
        assert.equal(parseDateInput('cool', now), null)
        // 'soon' is due-specific (the valueless due), not a date.
        assert.equal(parseDateInput('soon', now), null)
    })
})

describe('dateSuggestions', () => {
    it('lists today, tomorrow, nine weekday rows, then period starts', () => {
        const suggestions = dateSuggestions()
        const names = suggestions.map((s) => s.name)
        assert.equal(suggestions.length, 14)
        assert.equal(names[0], 'Today')
        assert.equal(names[1], 'Tomorrow')
        // Tomorrow repeats under its own weekday name so typing "thu" matches.
        assert.equal(suggestions[2].value, suggestions[1].value)
        // Weekday names repeating past a week read "Next <weekday>".
        assert(names[9].startsWith('Next '), names[9])
        assert(names[10].startsWith('Next '), names[10])
        assert.equal(names.slice(11).join(','), 'Next Month,Next Quarter,Next Year')
        for (const s of suggestions) {
            assert(/^\d{4}-\d{2}-\d{2}$/.test(s.value), `${s.name}: ${s.value}`)
            assert(s.detail, `${s.name} should carry a date detail`)
        }
        // The period starts land on the first of a month.
        for (const s of suggestions.slice(11)) {
            assert(s.value.endsWith('-01'), `${s.name}: ${s.value}`)
        }
    })
})

describe('parseDurationAttribute', () => {
    it('canonicalizes to <n><unit> with unit m / h / d', () => {
        assert.equal(parseDurationAttribute('30m')?.value, '30m')
        assert.equal(parseDurationAttribute('2h')?.value, '2h')
        assert.equal(parseDurationAttribute('1d')?.value, '1d')
        assert.equal(parseDurationAttribute('1.5h')?.value, '1.5h')
    })

    it('a bare number is minutes', () => {
        assert.equal(parseDurationAttribute('90')?.value, '90m')
    })

    it('accepts spelled-out units and whitespace', () => {
        assert.equal(parseDurationAttribute('30 min')?.value, '30m')
        assert.equal(parseDurationAttribute('2 hours')?.value, '2h')
        assert.equal(parseDurationAttribute('1 day')?.value, '1d')
        assert.equal(parseDurationAttribute(' 45 minutes ')?.value, '45m')
    })

    it('labels with pluralized unit names', () => {
        assert.equal(parseDurationAttribute('1h')?.label, '1 hour')
        assert.equal(parseDurationAttribute('2h')?.label, '2 hours')
        assert.equal(parseDurationAttribute('30m')?.label, '30 minutes')
    })

    it('rejects non-durations', () => {
        assert.equal(parseDurationAttribute(''), undefined)
        assert.equal(parseDurationAttribute('lots'), undefined)
        assert.equal(parseDurationAttribute('0'), undefined)
        assert.equal(parseDurationAttribute('-30m'), undefined)
        assert.equal(parseDurationAttribute('30x'), undefined)
    })
})
