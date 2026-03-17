describe("extension context", () => {
    it("is available as a global", () => {
        assert(context !== undefined, "context should be defined")
        assert(context !== null, "context should not be null")
    })

    it("has permissions", () => {
        assert(context.permissions, "context.permissions should exist")
    })

    it("has openURL permission", () => {
        assert.equal(context.permissions.contains("openURL"), true, "should have openURL permission")
    })
})
