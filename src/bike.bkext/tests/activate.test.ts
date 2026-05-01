describe("bike.activate", () => {
    it("is a function", () => {
        assert(typeof bike.activate === "function", "bike.activate should be a function")
    })

    it("can be called without throwing", () => {
        bike.activate()
    })

    it("returns undefined", () => {
        const result = bike.activate()
        assert.equal(result, undefined, "bike.activate should return undefined")
    })
})

describe("Window.activate", () => {
    const editor = bike.testEditor()
    const window = bike.frontmostWindow!

    it("is a function on Window", () => {
        assert(typeof window.activate === "function", "window.activate should be a function")
    })

    it("can be called without throwing", () => {
        window.activate()
    })

    it("returns undefined", () => {
        const result = window.activate()
        assert.equal(result, undefined, "window.activate should return undefined")
    })
})

describe("Document.activate", () => {
    const editor = bike.testEditor()
    const doc = bike.frontmostDocument!

    it("is a function on Document", () => {
        assert(typeof doc.activate === "function", "document.activate should be a function")
    })

    it("can be called without throwing", () => {
        doc.activate()
    })

    it("returns undefined", () => {
        const result = doc.activate()
        assert.equal(result, undefined, "document.activate should return undefined")
    })
})

describe("OutlineEditor.activate", () => {
    const editor = bike.testEditor()

    it("is a function on OutlineEditor", () => {
        assert(typeof editor.activate === "function", "editor.activate should be a function")
    })

    it("can be called without throwing", () => {
        editor.activate()
    })

    it("returns undefined", () => {
        const result = editor.activate()
        assert.equal(result, undefined, "editor.activate should return undefined")
    })

    it("activating frontmost editor keeps it frontmost", () => {
        const front = bike.frontmostOutlineEditor
        if (!front) return
        front.activate()
        assert.equal(bike.frontmostOutlineEditor, front, "frontmost editor should remain frontmost after activate")
    })
})

describe("PanelHandle.activate", () => {
    const editor = bike.testEditor()

    it("is exposed on the panel handle", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({ type: "ready" })
            }}
        `

        const handle = await bike.showPanel({ script: domScript, title: "Activate Test", width: 200, height: 150 })

        await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })

        assert(typeof handle.activate === "function", "handle.activate should be a function")
        const result = handle.activate()
        assert.equal(result, undefined, "handle.activate should return undefined")

        handle.dispose()
    })

    it("can be activated multiple times", async () => {
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({ type: "ready" })
            }}
        `

        const handle = await bike.showPanel({ script: domScript, role: 'utility', width: 200, height: 150 })

        await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })

        handle.activate()
        handle.activate()
        handle.activate()

        handle.dispose()
    })
})
