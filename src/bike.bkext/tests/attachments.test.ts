describe("Outline attachments", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    it("has attachmentMetadata function", () => {
        assert(typeof outline.attachmentMetadata === "function")
    })

    it("has attachmentBytes function", () => {
        assert(typeof outline.attachmentBytes === "function")
    })

    it("attachmentMetadata returns undefined for an unknown src", () => {
        assert.equal(outline.attachmentMetadata("not-a-real-attachment.png"), undefined)
        assert.equal(outline.attachmentMetadata(""), undefined)
    })

    it("attachmentBytes rejects for an unknown src", async () => {
        await assert.rejects(() => outline.attachmentBytes("not-a-real-attachment.png"))
    })
})
