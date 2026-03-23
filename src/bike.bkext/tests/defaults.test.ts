describe("context.defaults", () => {
    it("returns undefined for unset key", () => {
        assert.equal(context.defaults.get("__test_unset__"), undefined)
    })

    it("can set and get a string", () => {
        context.defaults.set("__test_string__", "hello")
        assert.equal(context.defaults.get("__test_string__"), "hello")
    })

    it("can set and get a number", () => {
        context.defaults.set("__test_number__", 42)
        assert.equal(context.defaults.get("__test_number__"), 42)
    })

    it("can set and get a boolean", () => {
        context.defaults.set("__test_bool__", true)
        assert.equal(context.defaults.get("__test_bool__"), true)
    })

    it("can set and get null", () => {
        context.defaults.set("__test_null__", null)
        assert.equal(context.defaults.get("__test_null__"), null)
    })

    it("can set and get an object", () => {
        const obj = { a: 1, b: "two" }
        context.defaults.set("__test_obj__", obj)
        const result = context.defaults.get("__test_obj__") as Record<string, unknown>
        assert.equal(result["a"], 1)
        assert.equal(result["b"], "two")
    })

    it("can set and get an array", () => {
        const arr = [1, "two", true]
        context.defaults.set("__test_arr__", arr)
        const result = context.defaults.get("__test_arr__") as unknown[]
        assert.equal(result.length, 3)
        assert.equal(result[0], 1)
        assert.equal(result[1], "two")
        assert.equal(result[2], true)
    })

    it("can delete a key", () => {
        context.defaults.set("__test_delete__", "exists")
        assert.equal(context.defaults.get("__test_delete__"), "exists")
        context.defaults.delete("__test_delete__")
        assert.equal(context.defaults.get("__test_delete__"), undefined)
    })

    it("set with undefined deletes the key", () => {
        context.defaults.set("__test_undef__", "exists")
        assert.equal(context.defaults.get("__test_undef__"), "exists")
        context.defaults.set("__test_undef__", undefined)
        assert.equal(context.defaults.get("__test_undef__"), undefined)
    })

    it("keys are isolated per extension", () => {
        context.defaults.set("__test_iso__", "from_bike")
        assert.equal(context.defaults.get("__test_iso__"), "from_bike")
        // Clean up
        context.defaults.delete("__test_iso__")
    })

    // Clean up all test keys
    it("cleanup", () => {
        context.defaults.delete("__test_string__")
        context.defaults.delete("__test_number__")
        context.defaults.delete("__test_bool__")
        context.defaults.delete("__test_null__")
        context.defaults.delete("__test_obj__")
        context.defaults.delete("__test_arr__")
        context.defaults.delete("__test_delete__")
        context.defaults.delete("__test_undef__")
    })
})
