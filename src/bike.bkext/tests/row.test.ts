describe("Row properties", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    // Set up rows for testing
    outline.transaction({ label: "setup" }, () => {
        outline.insertRows([
            { type: "heading", text: "Heading Row" },
            { text: "Body Row" },
            { type: "task", text: "Task Row" },
        ], outline.root)
        // Add children to first row
        outline.insertRows(["Child A", "Child B"], outline.root.firstChild!)
    })

    it("has id", () => {
        const row = outline.root.firstChild!
        assert(typeof row.id === "string", "id should be a string")
        assert(row.id.length > 0, "id should not be empty")
    })

    it("has outline reference", () => {
        const row = outline.root.firstChild!
        assert.equal(row.outline.root.id, outline.root.id)
    })

    it("has url", () => {
        const row = outline.root.firstChild!
        assert(row.url, "row should have a url")
        assert(typeof row.url.absoluteString === "string", "url absoluteString should be a string")
    })

    it("has type", () => {
        const rows = outline.root.children
        assert.equal(rows[0].type, "heading")
        assert.equal(rows[1].type, "body")
        assert.equal(rows[2].type, "task")
    })

    it("can set type", () => {
        const row = outline.root.children[1]
        row.type = "quote"
        assert.equal(row.type, "quote")
        row.type = "body"
    })

    it("has text as AttributedString", () => {
        const row = outline.root.firstChild!
        assert(row.text, "row should have text")
        assert.equal(row.text.string, "Heading Row")
        assert(typeof row.text.count === "number")
    })

    it("can set text", () => {
        const row = outline.root.children[1]
        row.text.string = "Updated Body"
        assert.equal(row.text.string, "Updated Body")
        row.text.string = "Body Row"
    })

    it("has level", () => {
        const topRow = outline.root.firstChild!
        const childRow = topRow.firstChild!
        assert.equal(topRow.level, 1)
        assert.equal(childRow.level, 2)
        assert.equal(outline.root.level, 0)
    })
})

describe("Row attributes", () => {
    const outline = bike.testOutline()

    outline.insertRows(["test row"], outline.root)

    it("has attributes record", () => {
        const row = outline.root.firstChild!
        assert(typeof row.attributes === "object", "attributes should be an object")
    })

    it("can set and get string attribute", () => {
        const row = outline.root.firstChild!
        row.setAttribute("done", "true")
        assert.equal(row.getAttribute("done"), "true")
        row.removeAttribute("done")
        assert.equal(row.getAttribute("done"), undefined)
    })

    it("can set and get number attribute", () => {
        const row = outline.root.firstChild!
        row.setAttribute("priority", 5)
        assert.equal(row.getAttribute("priority"), "5")
        row.removeAttribute("priority")
    })
})

describe("Row navigation", () => {
    const outline = bike.testOutline()

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows([
            { type: "heading", text: "Heading Row" },
            { text: "Body Row" },
            { type: "task", text: "Task Row" },
        ], outline.root)
        outline.insertRows(["Child A", "Child B"], outline.root.firstChild!)
    })

    it("has parent", () => {
        const row = outline.root.firstChild!
        assert.equal(row.parent!.id, outline.root.id)
    })

    it("root has no parent", () => {
        assert.equal(outline.root.parent, undefined)
    })

    it("has firstChild and lastChild", () => {
        const heading = outline.root.firstChild!
        assert.equal(heading.firstChild!.text.string, "Child A")
        assert.equal(heading.lastChild!.text.string, "Child B")
    })

    it("leaf rows have no children", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        assert.equal(childA.firstChild, undefined)
        assert.equal(childA.lastChild, undefined)
    })

    it("has nextSibling and prevSibling", () => {
        const rows = outline.root.children
        assert.equal(rows[0].nextSibling!.text.string, rows[1].text.string)
        assert.equal(rows[1].prevSibling!.text.string, rows[0].text.string)
        assert.equal(rows[0].prevSibling, undefined)
        assert.equal(rows[2].nextSibling, undefined)
    })

    it("has children array", () => {
        const heading = outline.root.firstChild!
        assert.equal(heading.children.length, 2)
    })

    it("has descendants", () => {
        const heading = outline.root.firstChild!
        assert.equal(heading.descendants.length, 2)
    })

    it("has descendantsWithSelf", () => {
        const heading = outline.root.firstChild!
        assert.equal(heading.descendantsWithSelf.length, 3)
        assert.equal(heading.descendantsWithSelf[0].id, heading.id)
    })

    it("has ancestors", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        const ancestors = childA.ancestors
        assert.equal(ancestors.length, 2)
    })

    it("has ancestorsWithSelf", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        assert.equal(childA.ancestorsWithSelf.length, 3)
    })

    it("has firstLeaf and lastLeaf", () => {
        const heading = outline.root.firstChild!
        assert.equal(heading.firstLeaf.text.string, "Child A")
        assert.equal(heading.lastLeaf.text.string, "Child B")
    })

    it("leaf firstLeaf is self", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        assert.equal(childA.firstLeaf.id, childA.id)
    })

    it("has prevBranch and nextBranch", () => {
        const rows = outline.root.children
        assert.equal(rows[0].nextBranch!.id, rows[1].id)
        assert.equal(rows[1].prevBranch!.id, rows[0].id)
    })

    it("has prevInOutline and nextInOutline", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        assert.equal(heading.nextInOutline!.id, childA.id)
        assert.equal(childA.prevInOutline!.id, heading.id)
    })

    it("isAncestor and isDescendant", () => {
        const heading = outline.root.firstChild!
        const childA = heading.firstChild!
        assert(childA.isAncestor(heading), "childA.isAncestor(heading) should be true")
        assert(heading.isDescendant(childA), "heading.isDescendant(childA) should be true")
        assert(!heading.isAncestor(childA), "heading.isAncestor(childA) should be false")
        assert(!childA.isDescendant(heading), "childA.isDescendant(heading) should be false")
    })
})

describe("Row types", () => {
    const outline = bike.testOutline()

    it("supports all row types", () => {
        const types: string[] = ["body", "heading", "quote", "code", "note", "unordered", "ordered", "task", "hr"]
        for (const t of types) {
            const rows = outline.insertRows([{ type: t as any, text: t === "hr" ? "" : `type-${t}` }], outline.root)
            assert.equal(rows[0].type, t)
        }
    })
})