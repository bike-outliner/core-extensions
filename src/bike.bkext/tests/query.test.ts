describe("Outline query", () => {
    const outline = bike.testOutline()

    outline.insertRows([
        { type: "heading", text: "Query Heading" },
        { text: "Query Body 1" },
        { type: "task", text: "Query Task" },
        { text: "Query Body 2" },
    ], outline.root)

    it("query //row returns all rows", () => {
        const result = outline.query("//row") as { type: "elements"; value: unknown[] }
        assert.equal(result.type, "elements")
        assert.equal(result.value.length, 4)
    })

    it("query //heading returns headings", () => {
        const result = outline.query("//heading") as { type: "elements"; value: unknown[] }
        assert.equal(result.type, "elements")
        assert.equal(result.value.length, 1)
    })

    it("query //task returns tasks", () => {
        const result = outline.query("//task") as { type: "elements"; value: unknown[] }
        assert.equal(result.type, "elements")
        assert.equal(result.value.length, 1)
    })

    it("query count() returns number", () => {
        const result = outline.query("count(//row)") as { type: "number"; value: number }
        assert.equal(result.type, "number")
        assert.equal(result.value, 4)
    })

    it("query returns rows with correct text", () => {
        const result = outline.query("//heading") as { type: "elements"; value: any[] }
        assert.equal(result.type, "elements")
        assert.equal(result.value.length, 1)
        assert.equal(result.value[0].text.string, "Query Heading")
    })

    it("query with no matches returns empty elements", () => {
        const result = outline.query("//hr") as { type: "elements"; value: unknown[] }
        assert.equal(result.type, "elements")
        assert.equal(result.value.length, 0)
    })
})

describe("Outline explainQuery", () => {
    const outline = bike.testOutline()

    it("returns explanation string", () => {
        const explanation = outline.explainQuery("//row")
        assert(typeof explanation === "string", "should return a string")
        assert(explanation.length > 0, "explanation should not be empty")
    })
})

describe("Outline scheduleQuery", () => {
    const outline = bike.testOutline()

    it("returns a disposable", () => {
        const disposable = outline.scheduleQuery("//row", () => {})
        assert(disposable, "should return a disposable")
        assert(typeof disposable.dispose === "function")
        disposable.dispose()
    })
})

describe("Outline streamQuery", () => {
    const outline = bike.testOutline()

    it("returns a disposable", () => {
        const disposable = outline.streamQuery("//row", () => {})
        assert(disposable, "should return a disposable")
        assert(typeof disposable.dispose === "function")
        disposable.dispose()
    })
})
