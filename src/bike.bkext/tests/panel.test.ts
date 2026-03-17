describe("showPanel", () => {
    const editor = bike.testEditor()

    it("has showPanel function", () => {
        assert(typeof bike.showPanel === "function", "showPanel should be a function")
    })

    it("can show a panel and get a handle", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({ type: "ready" })
            }}
        `

        const handle = await bike.showPanel({ script: domScript, title: "Test Panel", width: 200, height: 150 })
        assert(handle, "Expected a DOMScriptHandle from showPanel")

        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })

        assert.equal(response.type, "ready", "Panel should send ready message")
        handle.dispose()
    })

    it("can exchange messages with a panel", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.onmessage = function(message) {
                    context.postMessage({ type: "echo", echo: message.value, doubled: message.value * 2 })
                }
            }}
        `

        const handle = await bike.showPanel({ script: domScript, width: 200, height: 150 })

        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
            handle.postMessage({ type: "test", value: 21 })
        })

        assert.equal(response.echo, 21, "Panel should echo back the value")
        assert.equal(response.doubled, 42, "Panel should return doubled value")
        handle.dispose()
    })

    it("can send multiple messages to a panel", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                var count = 0
                context.onmessage = function(message) {
                    count++
                    context.postMessage({ type: "ack", text: message.text, count: count })
                }
            }}
        `

        const handle = await bike.showPanel({ script: domScript, width: 200, height: 150 })

        const responses: any[] = []
        const allReceived = new Promise<void>((resolve) => {
            handle.onmessage = (message: any) => {
                responses.push(message)
                if (responses.length === 3) resolve()
            }
        })

        handle.postMessage({ type: "send", text: "a" })
        handle.postMessage({ type: "send", text: "b" })
        handle.postMessage({ type: "send", text: "c" })

        await allReceived

        assert.equal(responses.length, 3, "Should have received 3 responses")
        assert.equal(responses[0].text, "a")
        assert.equal(responses[1].text, "b")
        assert.equal(responses[2].text, "c")
        assert.equal(responses[2].count, 3, "Counter should reach 3")
        handle.dispose()
    })

    it("dispose closes the panel", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({ type: "opened" })
            }}
        `

        const handle = await bike.showPanel({ script: domScript, width: 100, height: 100 })

        await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })

        // Should not throw
        handle.dispose()
    })

    it("can show a panel associated with a window", async () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")

        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({ type: "attached" })
            }}
        `

        const handle = await bike.showPanel({
            script: domScript,
            title: "Window Panel",
            width: 200,
            height: 150,
        }, window)

        assert(handle, "Expected a DOMScriptHandle from showPanel with window")

        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })

        assert.equal(response.type, "attached")
        handle.dispose()
    })

})