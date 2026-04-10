describe("keychain", () => {
    it("exists on bike global", () => {
        assert(bike.keychain, "keychain should exist")
    })

    it("has expected methods", () => {
        assert(typeof bike.keychain.get === "function", "get should be a function")
        assert(typeof bike.keychain.set === "function", "set should be a function")
        assert(typeof bike.keychain.delete === "function", "delete should be a function")
        assert(typeof bike.keychain.keys === "function", "keys should be a function")
    })

    it("returns undefined for unset key", () => {
        assert.equal(bike.keychain.get("__test_unset__"), undefined)
    })

    it("can set and get a secret", () => {
        assert.equal(bike.keychain.set("__test_secret__", "s3cret"), true)
        assert.equal(bike.keychain.get("__test_secret__"), "s3cret")
    })

    it("can overwrite an existing secret", () => {
        bike.keychain.set("__test_overwrite__", "first")
        assert.equal(bike.keychain.get("__test_overwrite__"), "first")
        bike.keychain.set("__test_overwrite__", "second")
        assert.equal(bike.keychain.get("__test_overwrite__"), "second")
    })

    it("can delete a secret", () => {
        bike.keychain.set("__test_delete__", "exists")
        assert.equal(bike.keychain.get("__test_delete__"), "exists")
        assert.equal(bike.keychain.delete("__test_delete__"), true)
        assert.equal(bike.keychain.get("__test_delete__"), undefined)
    })

    it("set with undefined deletes the key", () => {
        bike.keychain.set("__test_set_undef__", "exists")
        assert.equal(bike.keychain.get("__test_set_undef__"), "exists")
        bike.keychain.set("__test_set_undef__", undefined)
        assert.equal(bike.keychain.get("__test_set_undef__"), undefined)
    })

    it("delete returns true for nonexistent key", () => {
        assert.equal(bike.keychain.delete("__test_nonexistent__"), true)
    })

    it("keys lists stored keys", () => {
        bike.keychain.set("__test_keys_a__", "a")
        bike.keychain.set("__test_keys_b__", "b")
        const stored = bike.keychain.keys()
        assert(stored.includes("__test_keys_a__"), "should include key a")
        assert(stored.includes("__test_keys_b__"), "should include key b")
    })

    it("can store empty string", () => {
        bike.keychain.set("__test_empty__", "")
        assert.equal(bike.keychain.get("__test_empty__"), "")
    })

    it("can store unicode", () => {
        bike.keychain.set("__test_unicode__", "p\u00e4ssw\u00f6rd \ud83d\udd11")
        assert.equal(bike.keychain.get("__test_unicode__"), "p\u00e4ssw\u00f6rd \ud83d\udd11")
    })

    // Clean up all test keys
    it("cleanup", () => {
        bike.keychain.delete("__test_secret__")
        bike.keychain.delete("__test_overwrite__")
        bike.keychain.delete("__test_delete__")
        bike.keychain.delete("__test_set_undef__")
        bike.keychain.delete("__test_keys_a__")
        bike.keychain.delete("__test_keys_b__")
        bike.keychain.delete("__test_empty__")
        bike.keychain.delete("__test_unicode__")
    })
})
