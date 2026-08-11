import {
    dateIdPattern,
    dayIdFromDate,
    isDayId,
    isWeekId,
    startOfWeek,
    weekIdFromDate,
    weekStartsOn,
} from "../dom/protocols"
import { getDateComponents, getDaysInWeek } from "../app/util"

// Week start follows the machine's system preference, so nothing here hardcodes
// a weekday — the expectations are derived from startOfWeek/weekStartsOn and
// hold whichever day weeks begin on.

describe("startOfWeek", () => {
    it("lands on the configured first weekday", () => {
        assert.equal(startOfWeek(new Date(2026, 7, 6)).getDay(), weekStartsOn())
    })

    it("is idempotent and never moves forward", () => {
        const date = new Date(2026, 7, 6)
        const start = startOfWeek(date)
        assert.equal(startOfWeek(start).getTime(), start.getTime())
        assert(start.getTime() <= date.getTime(), "start is on or before the date")
        assert(date.getTime() - start.getTime() < 7 * 86_400_000, "within the same week")
    })

    it("is at local midnight", () => {
        const start = startOfWeek(new Date(2026, 7, 6, 13, 45))
        assert.equal(start.getHours(), 0)
        assert.equal(start.getMinutes(), 0)
    })
})

describe("weekIdFromDate", () => {
    it("fits the shared id pattern, in the week slot", () => {
        const id = weekIdFromDate(new Date(2026, 7, 6))
        assert(dateIdPattern.test(id), `${id} matches the id pattern`)
        assert(isWeekId(id), "is a week id")
        assert(!isDayId(id), "is not a day id — the month slot is zeroed")
    })

    it("gives every day of a week the same id", () => {
        const date = new Date(2026, 7, 6)
        const id = weekIdFromDate(date)
        for (const day of getDaysInWeek(date)) {
            assert.equal(weekIdFromDate(day), id, `${dayIdFromDate(day)} is in the same week`)
        }
    })

    it("matches the app's row-generation weekId", () => {
        const date = new Date(2026, 6, 20)
        assert.equal(weekIdFromDate(date), getDateComponents(date).weekId)
    })

    it("names the week for its first day's year, not the day's", () => {
        // Whichever day weeks start on, some early-January day belongs to a week
        // that began the previous December.
        for (let day = 1; day <= 7; day++) {
            const date = new Date(2027, 0, day)
            const start = startOfWeek(date)
            assert.equal(
                weekIdFromDate(date).slice(0, 4),
                String(start.getFullYear()),
                `Jan ${day} 2027 takes the year of its week start`
            )
        }
    })

    it("walks a year in unique, contiguous, chronological ordinals", () => {
        const ids: string[] = []
        for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(2026, d.getMonth(), d.getDate() + 1)) {
            const id = weekIdFromDate(d)
            if (ids[ids.length - 1] !== id) ids.push(id)
        }
        // A week straddling New Year is named for the previous year; drop it so
        // what remains is 2026's own run of weeks.
        const own = ids.filter((id) => id.startsWith("2026/"))
        assert(own.length >= 52, `${own.length} weeks in 2026`)
        assert.equal(new Set(own).size, own.length, "no repeats")
        own.forEach((id, i) => {
            assert.equal(id, `2026/00/${String(i + 1).padStart(2, "0")}`, "ordinals are 1-based and contiguous")
            if (i > 0) assert(own[i - 1] < id, `${own[i - 1]} sorts before ${id}`)
        })
    })

    it("stays inside the two-digit day slot", () => {
        // 53 is the most weeks a year can start; the slot holds two digits.
        for (const year of [2020, 2021, 2026, 2032]) {
            const last = weekIdFromDate(new Date(year, 11, 31))
            assert(dateIdPattern.test(last), `${last} still fits the pattern`)
        }
    })
})

describe("week ids are distinguishable from the other levels", () => {
    const date = new Date(2026, 6, 20)
    const { yearId, monthId, weekId, dayId } = getDateComponents(date)

    it("isWeekId accepts only the week id", () => {
        assert(isWeekId(weekId), "week id")
        assert(!isWeekId(dayId), "day id is not a week")
        assert(!isWeekId(monthId), "month id is not a week")
        assert(!isWeekId(yearId), "year id is not a week")
    })

    it("isDayId rejects a week id (its ordinal is not a day number)", () => {
        assert(isDayId(dayId), "day id")
        assert(!isDayId(weekId), "week id is not a day")
    })
})
