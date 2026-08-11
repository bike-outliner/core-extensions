import { dayIdFromDate, startOfWeek, substituteDate, weekIdFromDate } from "../dom/protocols"
import { getDayRow, getMonthRow, getWeekRow, getYearRow } from "../app/calendar-rows"
import { getDaysInWeek } from "../app/util"

describe("substituteDate", () => {
    const date = new Date(2026, 4, 26) // May 26, 2026

    it("formats a date-fns pattern inside { }", () => {
        assert.equal(substituteDate(date, "{ yyyy }"), "2026")
    })

    it("formats JSON Intl options (their own braces are the span)", () => {
        assert(substituteDate(date, '{"dateStyle":"long"}').includes("2026"), "includes the year")
    })

    it("keeps surrounding markdown, expanding the date in place", () => {
        assert.equal(substituteDate(date, "# { yyyy }"), "# 2026")
        assert.equal(substituteDate(date, "**{ yyyy }**"), "**2026**")
        assert.equal(substituteDate(date, "Week of { yyyy }"), "Week of 2026")
    })

    it("treats text with no { } as literal (no date)", () => {
        assert.equal(substituteDate(date, "yyyy"), "yyyy")
    })

    it("leaves an unclosed { } span alone", () => {
        assert.equal(substituteDate(date, "{ yyyy"), "{ yyyy")
    })

    it("formats each { } span independently (the week default's shape)", () => {
        assert.equal(substituteDate(date, "Week { yyyy } ({ MMM d })"), "Week 2026 (May 26)")
    })

    describe("escapeMarkdown (row-generation path)", () => {
        // `{ d. }` -> "26." reproduces, locale-independently, the leading marker
        // that German `dateStyle:long` ("28. Mai 2026") emits.
        it("escapes a leading ordered-list marker in the formatted date", () => {
            assert.equal(substituteDate(date, "{ d. }", { escapeMarkdown: true }), "26\\.")
        })

        it("leaves the date verbatim when not escaping (preview path)", () => {
            assert.equal(substituteDate(date, "{ d. }"), "26.")
        })

        it("escapes only the date span, never the author's template markup", () => {
            // The "# " is the user's heading marker (outside the braces) and must survive.
            assert.equal(substituteDate(date, "# { yyyy }", { escapeMarkdown: true }), "# 2026")
        })
    })
})

describe("row generation", () => {
    const date = new Date(2026, 4, 26)

    it("generates Year > Month > Day at the document root by default", () => {
        const outline = bike.testEditor().outline
        const day = getDayRow(outline, date)
        assert.equal(day.persistentId, "2026/05/26")
        assert.equal(day.parent!.persistentId, "2026/05/00")
        assert.equal(day.parent!.parent!.persistentId, "2026/00/00")
        assert.equal(day.parent!.parent!.parent!.id, outline.root.id, "year sits at the document root")
    })

    it("skips Month when monthEnabled is false", () => {
        bike.defaults.set("monthEnabled", false)
        try {
            const outline = bike.testEditor().outline
            const day = getDayRow(outline, date)
            assert.equal(day.parent!.persistentId, "2026/00/00", "day under year")
            assert.equal(day.parent!.parent!.id, outline.root.id, "year at root")
        } finally {
            bike.defaults.delete("monthEnabled")
        }
    })

    it("flattens to Day at the document root when Year and Month are off", () => {
        bike.defaults.set("yearEnabled", false)
        bike.defaults.set("monthEnabled", false)
        try {
            const outline = bike.testEditor().outline
            const day = getDayRow(outline, date)
            assert.equal(day.parent!.id, outline.root.id)
        } finally {
            bike.defaults.delete("yearEnabled")
            bike.defaults.delete("monthEnabled")
        }
    })

    it("follows existing structure: new rows join a relocated calendar", () => {
        const outline = bike.testEditor().outline
        const journal = outline.insertRows([{ text: "Journal" }], outline.root)[0]
        const y2025 = outline.insertRows([{ persistentId: "2025/00/00", text: "2025" }], journal)[0]
        // A new day in 2026 should create 2026 under Journal (next to 2025), not at root.
        getDayRow(outline, new Date(2026, 0, 1))
        const y2026 = outline.getRowById("2026/00/00")!
        assert.equal(y2026.parent!.id, journal.id, "2026 joins the calendar under Journal")
        assert.equal(y2025.nextSibling!.persistentId, "2026/00/00", "ordered after 2025")
    })

    it("getYearRow fills every day in the year even with Year and Month off", () => {
        bike.defaults.set("yearEnabled", false)
        bike.defaults.set("monthEnabled", false)
        try {
            const outline = bike.testEditor().outline
            getYearRow(outline, new Date(2026, 0, 1))
            assert(outline.getRowById("2026/01/01"), "Jan 1 created")
            assert(outline.getRowById("2026/12/31"), "Dec 31 created")
            assert.equal(outline.getRowById("2026/06/15")!.parent!.id, outline.root.id, "injected flat at root")
        } finally {
            bike.defaults.delete("yearEnabled")
            bike.defaults.delete("monthEnabled")
        }
    })

    it("getMonthRow fills every day in the month even with Month off", () => {
        bike.defaults.set("monthEnabled", false)
        try {
            const outline = bike.testEditor().outline
            getMonthRow(outline, new Date(2026, 1, 1)) // February 2026
            assert(outline.getRowById("2026/02/01"), "Feb 1 created")
            assert(outline.getRowById("2026/02/28"), "Feb 28 created")
            assert.equal(outline.getRowById("2026/02/14")!.parent!.persistentId, "2026/00/00", "injected under year")
        } finally {
            bike.defaults.delete("monthEnabled")
        }
    })
})

describe("week level", () => {
    const date = new Date(2026, 4, 26)

    // Week defaults off, so every case here opts in and cleans up after itself.
    function withWeek(extra: Record<string, boolean>, body: () => void) {
        bike.defaults.set("weekEnabled", true)
        for (const [key, value] of Object.entries(extra)) bike.defaults.set(key, value)
        try {
            body()
        } finally {
            bike.defaults.delete("weekEnabled")
            for (const key of Object.keys(extra)) bike.defaults.delete(key)
        }
    }

    it("is off by default — the shape is unchanged until you enable it", () => {
        const outline = bike.testEditor().outline
        const day = getDayRow(outline, date)
        assert.equal(day.parent!.persistentId, "2026/05/00", "day still under its month")
    })

    it("generates Year > Week > Day with Month off", () => {
        withWeek({ monthEnabled: false }, () => {
            const outline = bike.testEditor().outline
            const day = getDayRow(outline, date)
            assert.equal(day.persistentId, "2026/05/26")
            assert.equal(day.parent!.persistentId, weekIdFromDate(date), "day under its week")
            assert.equal(day.parent!.parent!.persistentId, "2026/00/00", "week under the year")
            assert.equal(day.parent!.parent!.parent!.id, outline.root.id, "year at the document root")
        })
    })

    it("nests under Month when both are on", () => {
        withWeek({}, () => {
            const outline = bike.testEditor().outline
            const day = getDayRow(outline, date)
            const week = day.parent!
            assert.equal(week.persistentId, weekIdFromDate(date))
            // The week's month is its FIRST day's month, which for a week inside
            // one month is that month.
            assert.equal(week.parent!.persistentId, "2026/05/00")
            assert.equal(week.parent!.parent!.persistentId, "2026/00/00")
        })
    })

    it("gathers a week's days under one row, whichever day comes first", () => {
        withWeek({ monthEnabled: false }, () => {
            const outline = bike.testEditor().outline
            const days = getDaysInWeek(date)
            // Deliberately out of order: the last day of the week creates the
            // week row, the first must then join it rather than make a second.
            for (const day of [...days].reverse()) getDayRow(outline, day)
            const weekId = weekIdFromDate(date)
            const week = outline.getRowById(weekId)!
            assert.equal(week.children.length, 7, "all seven days under one week row")
            for (const day of days) {
                assert.equal(outline.getRowById(dayIdFromDate(day))!.parent!.persistentId, weekId)
            }
        })
    })

    it("keeps a month-straddling week whole, under its first day's month", () => {
        // Whichever day weeks start on, some day sits in a week that began in
        // the previous month — find the first one in 2026.
        let straddler: Date | undefined
        for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(2026, d.getMonth(), d.getDate() + 1)) {
            if (startOfWeek(d).getMonth() !== d.getMonth()) {
                straddler = d
                break
            }
        }
        assert(straddler, "found a week that straddles a month boundary")
        withWeek({}, () => {
            const outline = bike.testEditor().outline
            const day = getDayRow(outline, straddler!)
            const week = day.parent!
            const start = startOfWeek(straddler!)
            const startMonthId = `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, "0")}/00`
            assert.equal(week.persistentId, weekIdFromDate(straddler!))
            assert.equal(week.parent!.persistentId, startMonthId, "week sits under its first day's month")
        })
    })

    it("getWeekRow fills every day in the week", () => {
        withWeek({}, () => {
            const outline = bike.testEditor().outline
            getWeekRow(outline, date)
            for (const day of getDaysInWeek(date)) {
                assert(outline.getRowById(dayIdFromDate(day)), `${dayIdFromDate(day)} created`)
            }
        })
    })

    it("getWeekRow still fills the days with the week level off", () => {
        const outline = bike.testEditor().outline
        getWeekRow(outline, date)
        for (const day of getDaysInWeek(date)) {
            assert(outline.getRowById(dayIdFromDate(day)), `${dayIdFromDate(day)} created`)
        }
        assert(!outline.getRowById(weekIdFromDate(date)), "but no week row")
    })
})

describe("markdown sets the row type on insert", () => {
    const date = new Date(2026, 4, 26)

    function dayTypeFor(format: string): string {
        bike.defaults.set("dayNameFormat", format)
        try {
            const outline = bike.testEditor().outline
            return getDayRow(outline, date).type
        } finally {
            bike.defaults.delete("dayNameFormat")
        }
    }

    it("# is a heading", () => assert.equal(dayTypeFor("# { yyyy }"), "heading"))
    it("> is a quote", () => assert.equal(dayTypeFor("> { yyyy }"), "quote"))
    it("1. is ordered", () => assert.equal(dayTypeFor("1. { yyyy }"), "ordered"))
    it("- is unordered", () => assert.equal(dayTypeFor("- { yyyy }"), "unordered"))
    it("plain is body", () => assert.equal(dayTypeFor("{ yyyy }"), "body"))

    // A leading marker that comes from the formatted date itself (not the
    // template) must NOT change the row type — the German `28. Mai 2026` bug.
    it("a date whose own text starts with a number is body, not ordered", () => {
        assert.equal(dayTypeFor("{ d. MMMM yyyy }"), "body")
    })
})
