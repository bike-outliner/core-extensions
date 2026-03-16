import { URL } from 'bike/app'

describe("URL", () => {
    it("can create from string", () => {
        const url = new URL("https://example.com/path?key=value#frag")
        assert(url, "URL should be created")
    })

    it("has scheme", () => {
        const url = new URL("https://example.com")
        assert.equal(url.scheme, "https")
    })

    it("has host", () => {
        const url = new URL("https://example.com/path")
        assert.equal(url.host, "example.com")
    })

    it("has path", () => {
        const url = new URL("https://example.com/some/path")
        assert.equal(url.path, "/some/path")
    })

    it("has query", () => {
        const url = new URL("https://example.com?foo=bar")
        assert.equal(url.query, "foo=bar")
    })

    it("has queryParameters", () => {
        const url = new URL("https://example.com?foo=bar&baz=qux")
        assert(url.queryParameters, "queryParameters should exist")
        assert.equal(url.queryParameters!["foo"], "bar")
        assert.equal(url.queryParameters!["baz"], "qux")
    })

    it("has fragment", () => {
        const url = new URL("https://example.com#section")
        assert.equal(url.fragment, "section")
    })

    it("has absoluteString", () => {
        const url = new URL("https://example.com/path")
        assert(typeof url.absoluteString === "string")
        assert(url.absoluteString.includes("example.com"))
    })

    it("can modify queryParameters", () => {
        const url = new URL("https://example.com?a=1")
        url.queryParameters = { a: "1", b: "2" }
        assert.equal(url.queryParameters!["b"], "2")
    })

    it("has open function", () => {
        const url = new URL("https://example.com")
        assert(typeof url.open === "function", "open should be a function")
    })

    it("can parse bike:// URLs", () => {
        const url = new URL("bike://doc-id#row-id")
        assert.equal(url.scheme, "bike")
        assert.equal(url.fragment, "row-id")
    })
})

describe("Timers", () => {
    it("setTimeout is available", () => {
        assert(typeof setTimeout === "function")
    })

    it("clearTimeout is available", () => {
        assert(typeof clearTimeout === "function")
    })

    it("setInterval is available", () => {
        assert(typeof setInterval === "function")
    })

    it("clearInterval is available", () => {
        assert(typeof clearInterval === "function")
    })

    it("setTimeout returns a number", () => {
        const id = setTimeout(() => {}, 10000)
        assert(typeof id === "number", "setTimeout should return a number")
        clearTimeout(id)
    })

    it("setInterval returns a number", () => {
        const id = setInterval(() => {}, 10000)
        assert(typeof id === "number", "setInterval should return a number")
        clearInterval(id)
    })
})

describe("Console", () => {
    it("has log function", () => {
        assert(typeof console.log === "function")
    })

    it("has error function", () => {
        assert(typeof console.error === "function")
    })

    it("has warn function", () => {
        assert(typeof console.warn === "function")
    })

    it("has info function", () => {
        assert(typeof console.info === "function")
    })

    it("has debug function", () => {
        assert(typeof console.debug === "function")
    })

    it("has trace function", () => {
        assert(typeof console.trace === "function")
    })
})

describe("Disposable pattern", () => {
    it("commands disposable removes commands", () => {
        const d = bike.commands.addCommands({
            commands: { "test:disposable-test": () => true },
        })
        assert(bike.commands.toString().includes("test:disposable-test"))
        d.dispose()
        assert(!bike.commands.toString().includes("test:disposable-test"))
    })

    it("keybindings disposable removes keybindings", () => {
        const d = bike.keybindings.addKeybindings({
            keymap: "text-mode",
            keybindings: { "ctrl-shift-d": "test:disposable-kb" },
        })
        assert(bike.keybindings.toString().includes("test:disposable-kb"))
        d.dispose()
        assert(!bike.keybindings.toString().includes("test:disposable-kb"))
    })

    it("observeChanges disposable stops observation", () => {
        const outline = bike.testOutline()
        const d = outline.observeChanges(() => {})
        assert(typeof d.dispose === "function")
        d.dispose()
    })

    it("observeSelection disposable stops observation", () => {
        const editor = bike.testEditor()
        const d = editor.observeSelection(() => {})
        assert(typeof d.dispose === "function")
        d.dispose()
    })
})

describe("Fetch API", () => {
    it("fetch function exists", () => {
        assert(typeof fetch === "function", "fetch should be available")
    })
})
