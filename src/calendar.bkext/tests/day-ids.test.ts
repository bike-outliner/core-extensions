import { dayIdFromDate, isDayId } from "../dom/protocols"
import { getDateComponents } from "../app/util"

describe("dayIdFromDate", () => {
    it("zero-pads so lexical order is chronological", () => {
        assert.equal(dayIdFromDate(new Date(2026, 0, 2)), "2026/01/02")
        assert.equal(dayIdFromDate(new Date(2026, 11, 31)), "2026/12/31")
        assert(dayIdFromDate(new Date(2026, 8, 30)) < dayIdFromDate(new Date(2026, 9, 1)), "Sep 30 < Oct 1")
    })

    it("matches the app's row-generation dayId", () => {
        const date = new Date(2026, 6, 20)
        assert.equal(dayIdFromDate(date), getDateComponents(date).dayId)
    })

    it("produces ids isDayId accepts, unlike month/year ids", () => {
        const date = new Date(2026, 6, 20)
        assert(isDayId(dayIdFromDate(date)), "day id is a day id")
        assert(!isDayId(getDateComponents(date).monthId), "month id is not")
        assert(!isDayId(getDateComponents(date).yearId), "year id is not")
    })
})
