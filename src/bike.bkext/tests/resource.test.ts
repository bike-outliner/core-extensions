describe("context.resourceURL", () => {
    it("is a function", () => {
        assert(typeof context.resourceURL === "function")
    })

    it("returns a bike-resource:// URL", () => {
        const url = context.resourceURL("images/icon.png")
        assert(url.startsWith("bike-resource://"), "should start with bike-resource://")
    })

    it("includes the file path", () => {
        const url = context.resourceURL("data/config.json")
        assert(url.endsWith("/data/config.json"), "should end with the relative path")
    })

    it("includes the extension id in the host", () => {
        const url = context.resourceURL("test.txt")
        assert(url.includes("bike-resource://bike/"), "should include extension id 'bike'")
    })
})

describe("context.readFile", () => {
    it("is a function", () => {
        assert(typeof context.readFile === "function")
    })

    it("can read manifest.json as text", () => {
        const text = context.readFile("manifest.json")
        assert(typeof text === "string", "should return a string")
        const json = JSON.parse(text)
        assert.equal(json.version, "0.1.0")
    })

    it("can read manifest.json with explicit utf-8 encoding", () => {
        const text = context.readFile("manifest.json", { encoding: "utf-8" })
        const json = JSON.parse(text)
        assert(json.permissions, "should have permissions field")
    })

    it("can read a file as base64", () => {
        const base64 = context.readFile("manifest.json", { encoding: "base64" })
        assert(typeof base64 === "string", "should return a string")
        // base64 should not contain typical JSON characters directly
        assert(!base64.includes("{"), "base64 should not contain raw JSON braces")
    })

    it("throws for path traversal with ..", () => {
        assert.throws(() => {
            context.readFile("../../some-other-extension/manifest.json")
        })
    })

    it("throws for nonexistent file", () => {
        assert.throws(() => {
            context.readFile("nonexistent-file-that-does-not-exist.txt")
        })
    })

    it("throws for unsupported encoding", () => {
        assert.throws(() => {
            context.readFile("manifest.json", { encoding: "utf-16" as any })
        })
    })
})
