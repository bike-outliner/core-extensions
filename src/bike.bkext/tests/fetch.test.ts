// Tests for the fetch API surface (fetch, AbortController/AbortSignal,
// TextEncoder/TextDecoder). bike.bkext declares no host_permissions, so
// network requests are expected to be blocked — network-path coverage lives
// in the native ScriptContextTests. Everything else is testable locally.

describe("Fetch", () => {
    it("fetch function exists", () => {
        assert(typeof fetch === "function", "fetch should be available")
    })

    it("rejects blocked hosts with TypeError", async () => {
        try {
            await fetch("https://example.com/")
            assert(false, "expected fetch to reject without host_permissions")
        } catch (error: any) {
            assert.equal(error.name, "TypeError")
        }
    })

    it("rejects invalid URLs with TypeError", async () => {
        try {
            await fetch("http://exa mple.com/")
            assert(false, "expected fetch to reject for invalid URL")
        } catch (error: any) {
            assert.equal(error.name, "TypeError")
        }
    })
})

describe("AbortController", () => {
    it("starts unaborted with undefined reason", () => {
        const controller = new AbortController()
        assert(!controller.signal.aborted)
        assert(controller.signal.reason === undefined || controller.signal.reason === null)
    })

    it("abort sets aborted and custom reason", () => {
        const controller = new AbortController()
        controller.abort("custom-reason")
        assert(controller.signal.aborted)
        assert.equal(controller.signal.reason, "custom-reason")
    })

    it("default reason is an AbortError", () => {
        const controller = new AbortController()
        controller.abort()
        assert.equal(controller.signal.reason.name, "AbortError")
    })

    it("only the first abort applies", () => {
        const controller = new AbortController()
        controller.abort("first")
        controller.abort("second")
        assert.equal(controller.signal.reason, "first")
    })

    it("fires onabort and addEventListener once each", () => {
        const controller = new AbortController()
        let events = 0
        controller.signal.onabort = (event) => {
            assert.equal(event.type, "abort")
            events += 1
        }
        controller.signal.addEventListener("abort", () => { events += 1 })
        controller.abort()
        controller.abort()
        assert.equal(events, 2)
    })

    it("removeEventListener removes a listener", () => {
        const controller = new AbortController()
        let events = 0
        const listener = () => { events += 1 }
        controller.signal.addEventListener("abort", listener)
        controller.signal.removeEventListener("abort", listener)
        controller.abort()
        assert.equal(events, 0)
    })

    it("listeners added after abort never fire", () => {
        const controller = new AbortController()
        controller.abort()
        let events = 0
        controller.signal.addEventListener("abort", () => { events += 1 })
        assert.equal(events, 0)
    })

    it("throwIfAborted throws once aborted", () => {
        const controller = new AbortController()
        controller.signal.throwIfAborted() // no-op before abort
        controller.abort()
        let threw = false
        try {
            controller.signal.throwIfAborted()
        } catch {
            threw = true
        }
        assert(threw, "throwIfAborted should throw after abort")
    })

    it("AbortSignal.abort() returns an aborted signal", () => {
        const signal = AbortSignal.abort()
        assert(signal.aborted)
        assert.equal(signal.reason.name, "AbortError")
    })

    it("AbortSignal.timeout() aborts with TimeoutError", async () => {
        const signal = AbortSignal.timeout(10)
        assert(!signal.aborted, "should not start aborted")
        await new Promise<void>(resolve => setTimeout(resolve, 100))
        assert(signal.aborted, "should abort after the timeout")
        assert.equal(signal.reason.name, "TimeoutError")
    })
})

describe("TextEncoder", () => {
    it("encodes to a Uint8Array", () => {
        const u8 = new TextEncoder().encode("€")
        assert(u8 instanceof Uint8Array, "encode should return a Uint8Array")
        assert.equal(Array.from(u8).join(","), "226,130,172")
    })
})

describe("TextDecoder", () => {
    it("decodes UTF-8", () => {
        assert.equal(new TextDecoder().decode(new Uint8Array([104, 105])), "hi")
    })

    it("replaces invalid sequences with U+FFFD", () => {
        assert.equal(new TextDecoder().decode(new Uint8Array([104, 255, 105])), "h�i")
    })

    it("streams across chunk boundaries", () => {
        const decoder = new TextDecoder()
        // '€' is [226, 130, 172]; split it across two chunks.
        assert.equal(decoder.decode(new Uint8Array([104, 226, 130]), { stream: true }), "h")
        assert.equal(decoder.decode(new Uint8Array([172]), { stream: true }), "€")
        assert.equal(decoder.decode(), "")
    })

    it("accepts an ArrayBuffer", () => {
        const bytes = new Uint8Array([104, 105])
        assert.equal(new TextDecoder().decode(bytes.buffer), "hi")
    })

    it("respects typed array view offsets", () => {
        const bytes = new Uint8Array([0, 104, 105, 0])
        assert.equal(new TextDecoder().decode(new Uint8Array(bytes.buffer, 1, 2)), "hi")
    })

    it("accepts a DataView", () => {
        const bytes = new Uint8Array([0, 104, 105, 0])
        assert.equal(new TextDecoder().decode(new DataView(bytes.buffer, 1, 2)), "hi")
    })
})
