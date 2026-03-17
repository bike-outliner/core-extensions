describe("DOM Context Messaging", () => {
    const editor = bike.testEditor()

    it("can present a sheet and exchange messages", async () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")

        const domScript = `
            var extensionExports = { activate: function(context) {
                context.onmessage = function(message) {
                    context.postMessage({ type: "echo", echo: message.value, added: message.value + 1 })
                }
            }}
        `

        const handle = await window!.presentSheet(domScript, { width: 100, height: 100 })
        assert(handle, "Expected a DOMScriptHandle from presentSheet")

        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => {
                resolve(message)
            }
            handle.postMessage({ type: "test", value: 42 })
        })

        assert.equal(response.echo, 42, "DOM should echo back the value")
        assert.equal(response.added, 43, "DOM should return value + 1")
        handle.dispose()
    })

    /*
    it("can send multiple messages", async () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")

        const domScript = `
            var extensionExports = { activate: function(context) {
                var count = 0
                context.onmessage = function(message) {
                    count++
                    context.postMessage({ type: "ack", received: message.text, count: count })
                }
            }}
        `

        const handle = await window!.presentSheet(domScript, { width: 100, height: 100 })

        const responses: any[] = []
        const allReceived = new Promise<void>((resolve) => {
            handle.onmessage = (message: any) => {
                responses.push(message)
                if (responses.length === 3) resolve()
            }
        })

        handle.postMessage({ type: "send", text: "first" })
        handle.postMessage({ type: "send", text: "second" })
        handle.postMessage({ type: "send", text: "third" })

        await allReceived

        assert.equal(responses.length, 3, "Should have received 3 responses")
        assert.equal(responses[0].received, "first")
        assert.equal(responses[1].received, "second")
        assert.equal(responses[2].received, "third")
        assert.equal(responses[2].count, 3, "Counter should reach 3")
        handle.dispose()
    })

    it("can send complex JSON messages", async () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")

        const domScript = `
            var extensionExports = { activate: function(context) {
                context.onmessage = function(message) {
                    context.postMessage({
                        type: "result",
                        keys: Object.keys(message),
                        arrayLength: message.items.length,
                        nested: message.nested.value
                    })
                }
            }}
        `

        const handle = await window!.presentSheet(domScript, { width: 100, height: 100 })

        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
            handle.postMessage({
                type: "data",
                items: [1, 2, 3],
                nested: { value: "deep" },
                flag: true
            })
        })

        assert.equal(response.arrayLength, 3)
        assert.equal(response.nested, "deep")
        assert(response.keys.includes("items"))
        assert(response.keys.includes("nested"))
        assert(response.keys.includes("flag"))
        handle.dispose()
    })
    */
})
