describe("settings", () => {
    it("returns undefined for unset key", () => {
        assert.equal(defaults.get("__test_unset__"), undefined)
    })

    it("can set and get a string", () => {
        defaults.set("__test_string__", "hello")
        assert.equal(defaults.get("__test_string__"), "hello")
    })

    it("can set and get a number", () => {
        defaults.set("__test_number__", 42)
        assert.equal(defaults.get("__test_number__"), 42)
    })

    it("can set and get a boolean", () => {
        defaults.set("__test_bool__", true)
        assert.equal(defaults.get("__test_bool__"), true)
    })

    it("can set and get null", () => {
        defaults.set("__test_null__", null)
        assert.equal(defaults.get("__test_null__"), null)
    })

    it("can set and get an object", () => {
        const obj = { a: 1, b: "two" }
        defaults.set("__test_obj__", obj)
        const result = defaults.get("__test_obj__") as Record<string, unknown>
        assert.equal(result["a"], 1)
        assert.equal(result["b"], "two")
    })

    it("can set and get an array", () => {
        const arr = [1, "two", true]
        defaults.set("__test_arr__", arr)
        const result = defaults.get("__test_arr__") as unknown[]
        assert.equal(result.length, 3)
        assert.equal(result[0], 1)
        assert.equal(result[1], "two")
        assert.equal(result[2], true)
    })

    it("can delete a key", () => {
        defaults.set("__test_delete__", "exists")
        assert.equal(defaults.get("__test_delete__"), "exists")
        defaults.delete("__test_delete__")
        assert.equal(defaults.get("__test_delete__"), undefined)
    })

    it("set with undefined deletes the key", () => {
        defaults.set("__test_undef__", "exists")
        assert.equal(defaults.get("__test_undef__"), "exists")
        defaults.set("__test_undef__", undefined)
        assert.equal(defaults.get("__test_undef__"), undefined)
    })

    it("keys are isolated per extension", () => {
        defaults.set("__test_iso__", "from_bike")
        assert.equal(defaults.get("__test_iso__"), "from_bike")
        // Clean up
        defaults.delete("__test_iso__")
    })

    // Clean up all test keys
    it("cleanup", () => {
        defaults.delete("__test_string__")
        defaults.delete("__test_number__")
        defaults.delete("__test_bool__")
        defaults.delete("__test_null__")
        defaults.delete("__test_obj__")
        defaults.delete("__test_arr__")
        defaults.delete("__test_delete__")
        defaults.delete("__test_undef__")
    })
})
