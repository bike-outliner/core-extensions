describe("calendar commands registration", () => {
    const commands = bike.commands.toString()

    it("registers calendar:today", () => {
        assert(commands.includes("calendar:today"), "calendar:today should be registered")
    })

    it("registers calendar:month", () => {
        assert(commands.includes("calendar:month"), "calendar:month should be registered")
    })

    it("registers calendar:year", () => {
        assert(commands.includes("calendar:year"), "calendar:year should be registered")
    })
})

describe("calendar row structure", () => {
    const editor = bike.testEditor()
    const outline = editor.outline
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const yearId = `${year}/00/00`
    const monthId = `${year}/${month}/00`
    const dayId = `${year}/${month}/${day}`

    it("can create a day row with calendar hierarchy", () => {
        // Insert calendar > year > month > day structure directly
        const calendarRow = outline.insertRows([{ id: "calendar", text: "Calendar" }], outline.root)[0]
        const yearRow = outline.insertRows([{ id: yearId, text: year }], calendarRow)[0]
        const monthRow = outline.insertRows([{ id: monthId, text: "Test Month" }], yearRow)[0]
        const dayRow = outline.insertRows([{ id: dayId, text: "Test Day" }], monthRow)[0]

        assert(outline.getRowById(yearId), "year row should exist")
        assert(outline.getRowById(monthId), "month row should exist")
        assert(outline.getRowById(dayId), "day row should exist")
    })

    it("getRowById returns existing rows", () => {
        const yearRow = outline.getRowById(yearId)!
        assert.equal(yearRow.text.string, year)
    })

    it("year contains month", () => {
        const yearRow = outline.getRowById(yearId)!
        const monthRow = outline.getRowById(monthId)!
        assert.equal(monthRow.parent!.id, yearRow.id)
    })

    it("month contains day", () => {
        const monthRow = outline.getRowById(monthId)!
        const dayRow = outline.getRowById(dayId)!
        assert.equal(dayRow.parent!.id, monthRow.id)
    })
})


