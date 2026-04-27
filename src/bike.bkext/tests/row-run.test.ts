describe("RowRun via run axis query", () => {
    const outline = bike.testOutline()

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows([
            { text: "Hello World" },
            { text: "Plain row" },
        ], outline.root)
        // First row gets two runs: "Hello" (strong) and " World" (plain)
        outline.root.firstChild!.text.addAttribute("strong", "", [0, 5])
    })

    const richRowId = outline.root.children[0].id
    const plainRowId = outline.root.children[1].id

    function richRuns() {
        const result = outline.query("//*/run::*") as { type: "elements"; value: any[] }
        return result.value.filter(r => r.row && r.row.id === richRowId)
    }

    function plainRuns() {
        const result = outline.query("//*/run::*") as { type: "elements"; value: any[] }
        return result.value.filter(r => r.row && r.row.id === plainRowId)
    }

    it("query //*/run::* returns elements", () => {
        const result = outline.query("//*/run::*") as { type: "elements"; value: any[] }
        assert.equal(result.type, "elements")
        assert(result.value.length > 0, "should return at least one run")
    })

    it("rich text row produces one run per attribute span", () => {
        assert.equal(richRuns().length, 2)
    })

    it("plain text row produces a single run", () => {
        assert.equal(plainRuns().length, 1)
    })

    it("RowRun.row points to the containing row", () => {
        const runs = richRuns()
        assert(runs[0].row, "row property should exist")
        assert.equal(runs[0].row.id, richRowId)
        assert.equal(runs[0].row.text.string, "Hello World")
    })

    it("RowRun.runStart is the char offset of the run", () => {
        const runs = richRuns()
        assert.equal(runs[0].runStart, 0)
        assert.equal(runs[1].runStart, 5)
    })

    it("plain text run.runStart is 0", () => {
        assert.equal(plainRuns()[0].runStart, 0)
    })

    it("RowRun.runString is the run's substring", () => {
        const runs = richRuns()
        assert.equal(runs[0].runString, "Hello")
        assert.equal(runs[1].runString, " World")
    })

    it("plain text run.runString is the full text", () => {
        assert.equal(plainRuns()[0].runString, "Plain row")
    })

    it("RowRun.runAttributes contains the run's attributes", () => {
        const runs = richRuns()
        assert.equal(runs[0].runAttributes.strong, "")
        assert.equal(runs[1].runAttributes.strong, undefined)
    })

    it("plain text run.runAttributes is empty", () => {
        const attrs = plainRuns()[0].runAttributes
        assert.equal(Object.keys(attrs).length, 0)
    })

    it("runStart + runString.length matches the next run's runStart", () => {
        const runs = richRuns()
        assert.equal(runs[0].runStart + runs[0].runString.length, runs[1].runStart)
    })

    it("concatenating runStrings reproduces the row's text", () => {
        const runs = richRuns()
        const reconstructed = runs.map(r => r.runString).join("")
        assert.equal(reconstructed, "Hello World")
    })
})

describe("RowRun multiple attribute spans", () => {
    const outline = bike.testOutline()

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows([{ text: "abcdefghij" }], outline.root)
        const text = outline.root.firstChild!.text
        // Three contiguous attribute spans: [0,3] strong, [3,6] em, [6,10] plain
        text.addAttribute("strong", "", [0, 3])
        text.addAttribute("em", "", [3, 6])
    })

    const rowId = outline.root.firstChild!.id

    it("produces three runs covering the full string", () => {
        const result = outline.query("//*/run::*") as { type: "elements"; value: any[] }
        const runs = result.value.filter(r => r.row && r.row.id === rowId)
        assert.equal(runs.length, 3)
        assert.equal(runs[0].runString, "abc")
        assert.equal(runs[1].runString, "def")
        assert.equal(runs[2].runString, "ghij")
        assert.equal(runs[0].runStart, 0)
        assert.equal(runs[1].runStart, 3)
        assert.equal(runs[2].runStart, 6)
        assert.equal(runs[0].runAttributes.strong, "")
        assert.equal(runs[1].runAttributes.em, "")
        assert.equal(Object.keys(runs[2].runAttributes).length, 0)
    })
})
