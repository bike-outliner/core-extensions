describe("Async Tests", () => {
    const editor = bike.testEditor()

    it("sync test still works", () => {
        assert(true)
    })

    it("async test with setTimeout", async () => {
        const start = Date.now()
        await new Promise<void>(resolve => setTimeout(resolve, 100))
        const elapsed = Date.now() - start
        assert(elapsed >= 50, "Expected at least 50ms to elapse, got " + elapsed)
    })

    it("async test with resolved promise", async () => {
        const value = await Promise.resolve(42)
        assert.equal(value, 42)
    })

    it("async test modifies outline", async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10))
        const outline = editor.outline
        outline.insertRows(["async row"], outline.root)
        assert(outline.root.firstChild, "Expected a child row after async insert")
        assert.equal(outline.root.firstChild!.text.string, "async row")
    })

    it("assert.rejects catches async failure", async () => {
        await assert.rejects(async () => {
            await new Promise<void>(resolve => setTimeout(resolve, 10))
            throw new Error("intentional async failure")
        })
    })
})
