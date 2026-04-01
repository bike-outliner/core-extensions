describe("extensionURL", () => {
    it("is a function", () => {
        assert(typeof extensionURL === "function")
    })

    it("returns a bike-extension:// URL", () => {
        const url = extensionURL("images/icon.png")
        assert(url.startsWith("bike-extension://"), "should start with bike-extension://")
    })

    it("includes the file path", () => {
        const url = extensionURL("data/config.json")
        assert(url.endsWith("/data/config.json"), "should end with the relative path")
    })

    it("includes the extension id in the host", () => {
        const url = extensionURL("test.txt")
        assert(url.includes("bike-extension://bike/"), "should include extension id 'bike'")
    })
})
