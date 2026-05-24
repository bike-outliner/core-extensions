describe("calendar extension context", () => {
    it("is available as a global", () => {
        assert(context !== undefined, "context should be defined")
        assert(context !== null, "context should not be null")
    })

    it("has permissions", () => {
        assert(context.permissions, "context.permissions should exist")
    })

    it("has no special permissions", () => {
        assert.equal(context.permissions.contains("openURL"), false, "should not have openURL")
        assert.equal(context.permissions.contains("clipboardRead"), false, "should not have clipboardRead")
        assert.equal(context.permissions.contains("clipboardWrite"), false, "should not have clipboardWrite")
    })
})
