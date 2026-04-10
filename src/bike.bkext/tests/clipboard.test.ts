describe("clipboard", () => {
    it("exists on bike global", () => {
        assert(bike.clipboard, "clipboard should exist")
    })

    it("has expected methods", () => {
        assert(typeof bike.clipboard.readText === "function", "readText should be a function")
        assert(typeof bike.clipboard.writeText === "function", "writeText should be a function")
    })

    it("can write and read text", () => {
        bike.clipboard.writeText("hello clipboard")
        assert.equal(bike.clipboard.readText(), "hello clipboard")
    })

    it("can overwrite clipboard contents", () => {
        bike.clipboard.writeText("first")
        assert.equal(bike.clipboard.readText(), "first")
        bike.clipboard.writeText("second")
        assert.equal(bike.clipboard.readText(), "second")
    })

    it("can write and read empty string", () => {
        bike.clipboard.writeText("")
        assert.equal(bike.clipboard.readText(), "")
    })

    it("can write and read unicode", () => {
        bike.clipboard.writeText("caf\u00e9 \ud83c\udf55")
        assert.equal(bike.clipboard.readText(), "caf\u00e9 \ud83c\udf55")
    })

    it("can write and read multiline text", () => {
        const text = "line one\nline two\nline three"
        bike.clipboard.writeText(text)
        assert.equal(bike.clipboard.readText(), text)
    })
})
