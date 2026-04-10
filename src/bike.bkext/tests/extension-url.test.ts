describe("bike.extensionURL", () => {
    it("is a function", () => {
        assert(typeof bike.extensionURL === "function")
    })

    it("returns a bike-extension:// URL", () => {
        const url = bike.extensionURL("images/icon.png")
        assert(url.startsWith("bike-extension://"), "should start with bike-extension://")
    })

    it("includes the file path", () => {
        const url = bike.extensionURL("data/config.json")
        assert(url.endsWith("/data/config.json"), "should end with the relative path")
    })

    it("includes the extension id in the host", () => {
        const url = bike.extensionURL("test.txt")
        assert(url.includes("bike-extension://bike/"), "should include extension id 'bike'")
    })
})
