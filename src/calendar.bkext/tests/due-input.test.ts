import { dayKey, parseDueInput } from '../dom/due-marks'

describe('parseDueInput', () => {
    // Tuesday, July 21 2026 — a fixed local `now` so weekday math is stable.
    const now = new Date(2026, 6, 21, 14, 30)

    function day(text: string): string | null {
        const parsed = parseDueInput(text, now)
        return parsed === null || parsed === 'soon' ? null : dayKey(parsed)
    }

    it('parses today / tomorrow / yesterday keywords and abbreviations', () => {
        assert.equal(day('today'), '2026-07-21')
        assert.equal(day('tod'), '2026-07-21')
        assert.equal(day('tomorrow'), '2026-07-22')
        assert.equal(day('tom'), '2026-07-22')
        assert.equal(day('yesterday'), '2026-07-20')
    })

    it('parses soon as the valueless due', () => {
        assert.equal(parseDueInput('soon', now), 'soon')
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
        assert.equal(parseDueInput('s', now), null)
        assert.equal(parseDueInput('t', now), null)
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
        assert.equal(parseDueInput('2026-13-01', now), null)
        assert.equal(parseDueInput('2026-01-42', now), null)
    })

    it('trims and lowercases', () => {
        assert.equal(day('  Friday  '), '2026-07-24')
        assert.equal(day('NEXT FRI'), '2026-07-31')
    })

    it('rejects garbage', () => {
        assert.equal(parseDueInput('', now), null)
        assert.equal(parseDueInput('xyzzy', now), null)
        assert.equal(parseDueInput('next', now), null)
        assert.equal(parseDueInput('+3x', now), null)
        assert.equal(parseDueInput('cool', now), null)
    })
})
