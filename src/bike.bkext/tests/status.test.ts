import { Row } from 'bike/app'
import { HIDE_DONE_ON_TASKS_PREDICATE, statusBadgeWhere } from '../app/features/status'

// The status badge's own render path is native (formatAttribute, the tag
// image), so what's testable from JS is the one thing the
// `hideDoneBadgeOnTasks` setting actually changes: which rows the badge's
// `where` selects. Run the predicate as a real query rather than string-
// comparing it — that proves it parses AND that it draws the line where the
// setting says, which a string assertion can't.

describe('status badge where', () => {
    it('is the bare has-a-status test when nothing is suppressed', () => {
        assert.equal(statusBadgeWhere(false), '.@status')
    })

    it('composes the suppressing form from the shared predicate', () => {
        assert.equal(statusBadgeWhere(true), '.' + HIDE_DONE_ON_TASKS_PREDICATE)
    })
})

describe('suppressing the Done badge on tasks', () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: 'setup' }, () => {
        const rows = outline.insertRows(
            [
                { type: 'task', text: 'Done task' },
                { type: 'task', text: 'Canceled task' },
                { type: 'task', text: 'Started task' },
                { type: 'task', text: 'Todo task' },
                { type: 'heading', text: 'Done heading' },
                { type: 'body', text: 'Plain note' },
            ],
            outline.root
        )
        rows[0].setAttribute('status', 'done')
        rows[1].setAttribute('status', 'canceled')
        rows[2].setAttribute('status', 'started')
        rows[4].setAttribute('status', 'done')
    })

    // `//*` plus the predicate — the badge says `.` plus the same predicate,
    // which is the self axis rather than every descendant.
    function badgedTexts(predicate: string): string[] {
        const rows = outline.query('//* ' + predicate).value as Row[]
        return rows.map((row) => row.text.string)
    }

    it('badges every row with a status by default', () => {
        const texts = badgedTexts('@status')
        assert.equal(texts.length, 4)
        assert(texts.includes('Done task'), 'a done task is badged by default')
        assert(texts.includes('Canceled task'), 'a canceled task is badged')
        assert(texts.includes('Started task'), 'a started task is badged')
        assert(texts.includes('Done heading'), 'a done heading is badged')
    })

    // The whole point of the setting: a done task's checkbox already says
    // "done", and nothing else here has a checkbox saying it.
    it('drops the done task, and only the done task', () => {
        const texts = badgedTexts(HIDE_DONE_ON_TASKS_PREDICATE)
        assert.equal(texts.length, 3)
        assert(!texts.includes('Done task'), 'a done task loses its badge')
        assert(texts.includes('Canceled task'), 'canceled is the bit the checkbox cannot carry')
        assert(texts.includes('Started task'), 'an open task keeps its badge')
        assert(texts.includes('Done heading'), 'a done non-task has no checkbox, so it keeps its badge')
    })

    it('leaves rows with no status out either way', () => {
        assert(!badgedTexts('@status').includes('Plain note'), 'no status, no badge')
        assert(!badgedTexts(HIDE_DONE_ON_TASKS_PREDICATE).includes('Plain note'), 'still no badge')
        assert(!badgedTexts('@status').includes('Todo task'), 'an untouched task has no status attribute')
    })
})
