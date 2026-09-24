import { AttributeInfo } from 'bike/app'
import { dateAttributesFrom } from '../dom/date-marks'

// Calendar date attributes are discovered from the registry (app context
// only); pure filtering is covered in date-marks.test.ts.

function snapshot(): AttributeInfo[] {
  // observeAttributes emits synchronously on registration.
  let latest: AttributeInfo[] = []
  const observer = bike.observeAttributes((infos) => (latest = infos))
  observer.dispose()
  return latest
}

describe('calendar date attributes', () => {
  it('picks up the shipped date attributes, minus the opt-outs', () => {
    const names = dateAttributesFrom(snapshot()).map((attribute) => attribute.name)
    assert(names.includes('due'), 'due should show on the calendar')
    // `log-date` is a date but opts out with metadata.calendar === false.
    assert.equal(names.includes('log-date'), false, "the log's date should NOT show on the calendar")
    // Not a date at all.
    assert.equal(names.includes('estimate'), false)
  })

  it('picks up an attribute registered later, and drops it on disposal', () => {
    const before = dateAttributesFrom(snapshot()).map((attribute) => attribute.name)
    assert.equal(before.includes('smoke-cal-date'), false)

    const disposable = bike.attribute('smoke-cal-date', { type: 'date', title: 'Smoke' })
    const added = dateAttributesFrom(snapshot()).find((a) => a.name === 'smoke-cal-date')
    assert(added, 'a newly registered date attribute should show up')
    assert.equal(added!.title, 'Smoke', 'the registry title labels marks and agenda lines')

    disposable.dispose()
    const after = dateAttributesFrom(snapshot()).map((attribute) => attribute.name)
    assert.equal(after.includes('smoke-cal-date'), false, 'disposal should remove it')
  })

  it('honors the calendar opt-out on a third-party attribute', () => {
    const disposable = bike.attribute('smoke-cal-hidden', {
      type: 'date',
      metadata: { calendar: false },
    })
    const names = dateAttributesFrom(snapshot()).map((attribute) => attribute.name)
    assert.equal(names.includes('smoke-cal-hidden'), false)
    disposable.dispose()
  })
})
