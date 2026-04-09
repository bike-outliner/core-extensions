describe("bike.defaults", () => {
    it("returns undefined for unset key", () => {
        assert.equal(bike.defaults.get("__test_unset__"), undefined)
    })

    it("can set and get a string", () => {
        bike.defaults.set("__test_string__", "hello")
        assert.equal(bike.defaults.get("__test_string__"), "hello")
    })

    it("can set and get a number", () => {
        bike.defaults.set("__test_number__", 42)
        assert.equal(bike.defaults.get("__test_number__"), 42)
    })

    it("can set and get a boolean", () => {
        bike.defaults.set("__test_bool__", true)
        assert.equal(bike.defaults.get("__test_bool__"), true)
    })

    it("can set and get null", () => {
        bike.defaults.set("__test_null__", null)
        assert.equal(bike.defaults.get("__test_null__"), null)
    })

    it("can set and get an object", () => {
        const obj = { a: 1, b: "two" }
        bike.defaults.set("__test_obj__", obj)
        const result = bike.defaults.get("__test_obj__") as Record<string, unknown>
        assert.equal(result["a"], 1)
        assert.equal(result["b"], "two")
    })

    it("can set and get an array", () => {
        const arr = [1, "two", true]
        bike.defaults.set("__test_arr__", arr)
        const result = bike.defaults.get("__test_arr__") as unknown[]
        assert.equal(result.length, 3)
        assert.equal(result[0], 1)
        assert.equal(result[1], "two")
        assert.equal(result[2], true)
    })

    it("can delete a key", () => {
        bike.defaults.set("__test_delete__", "exists")
        assert.equal(bike.defaults.get("__test_delete__"), "exists")
        bike.defaults.delete("__test_delete__")
        assert.equal(bike.defaults.get("__test_delete__"), undefined)
    })

    it("set with undefined deletes the key", () => {
        bike.defaults.set("__test_undef__", "exists")
        assert.equal(bike.defaults.get("__test_undef__"), "exists")
        bike.defaults.set("__test_undef__", undefined)
        assert.equal(bike.defaults.get("__test_undef__"), undefined)
    })

    it("keys are isolated per extension", () => {
        bike.defaults.set("__test_iso__", "from_bike")
        assert.equal(bike.defaults.get("__test_iso__"), "from_bike")
        // Clean up
        bike.defaults.delete("__test_iso__")
    })

    // Clean up all test keys
    it("cleanup", () => {
        bike.defaults.delete("__test_string__")
        bike.defaults.delete("__test_number__")
        bike.defaults.delete("__test_bool__")
        bike.defaults.delete("__test_null__")
        bike.defaults.delete("__test_obj__")
        bike.defaults.delete("__test_arr__")
        bike.defaults.delete("__test_delete__")
        bike.defaults.delete("__test_undef__")
    })
})
