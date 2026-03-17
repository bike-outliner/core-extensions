import { Outline } from 'bike/app'



describe("Outline", () => {
    const outline = bike.testOutline()

    it("has root row", () => {
        assert(outline.root, "outline should have a root")
        assert(typeof outline.root.id === "string", "root should have an id")
    })

    it("starts empty", () => {
        assert(!outline.root.firstChild, "root should have no children initially")
        assert.equal(outline.root.children.length, 0)
    })

    it("has runtimeMetadata", () => {
        assert(outline.runtimeMetadata, "runtimeMetadata should exist")
        assert(typeof outline.runtimeMetadata.get === "function")
        assert(typeof outline.runtimeMetadata.set === "function")
        assert(typeof outline.runtimeMetadata.delete === "function")
    })

    it("has persistentMetadata", () => {
        assert(outline.persistentMetadata, "persistentMetadata should exist")
        assert(typeof outline.persistentMetadata.get === "function")
        assert(typeof outline.persistentMetadata.set === "function")
        assert(typeof outline.persistentMetadata.delete === "function")
    })

    it("can set and get runtimeMetadata", () => {
        outline.runtimeMetadata.set("test-key", "test-value")
        assert.equal(outline.runtimeMetadata.get("test-key"), "test-value")
        outline.runtimeMetadata.delete("test-key")
        assert.equal(outline.runtimeMetadata.get("test-key"), undefined)
    })

    it("can set and get persistentMetadata", () => {
        outline.persistentMetadata.set("test-key", 42)
        assert.equal(outline.persistentMetadata.get("test-key"), 42)
        outline.persistentMetadata.delete("test-key")
        assert.equal(outline.persistentMetadata.get("test-key"), undefined)
    })
    
})

describe("Outline insertRows", () => {
    const outline = bike.testOutline()

    it("inserts rows from string array", () => {
        outline.insertRows(["alpha", "beta", "gamma"], outline.root)
        assert.equal(outline.root.children.length, 3)
        assert.equal(outline.root.firstChild!.text.string, "alpha")
        assert.equal(outline.root.lastChild!.text.string, "gamma")
    })

    it("returns inserted rows", () => {
        const rows = outline.insertRows(["delta"], outline.root)
        assert.equal(rows.length, 1)
        assert.equal(rows[0].text.string, "delta")
    })

    it("inserts before a specific row", () => {
        const firstChild = outline.root.firstChild!
        outline.insertRows(["before-alpha"], outline.root, firstChild)
        assert.equal(outline.root.firstChild!.text.string, "before-alpha")
    })

    it("inserts rows from RowTemplate", () => {
        outline.insertRows(
            [{ type: "heading", text: "A Heading" }],
            outline.root
        )
        assert.equal(outline.root.lastChild!.type, "heading")
        assert.equal(outline.root.lastChild!.text.string, "A Heading")
    })

    it("inserts child rows", () => {
        const parent = outline.root.firstChild!
        outline.insertRows(["child-1", "child-2"], parent)
        assert.equal(parent.children.length, 2)
        assert.equal(parent.firstChild!.text.string, "child-1")
    })
})

describe("Outline moveRows", () => {
    const outline = bike.testOutline()

    it("moves rows to a new parent", () => {
        outline.insertRows(["parent", "child"], outline.root)
        const parent = outline.root.firstChild!
        const child = outline.root.lastChild!
        outline.moveRows([child], parent)
        assert.equal(outline.root.children.length, 1)
        assert.equal(parent.firstChild!.text.string, "child")
    })
})

describe("Outline removeRows", () => {
    const outline = bike.testOutline()

    it("removes rows", () => {
        outline.insertRows(["keep", "remove"], outline.root)
        const toRemove = outline.root.lastChild!
        outline.removeRows([toRemove])
        assert.equal(outline.root.children.length, 1)
        assert.equal(outline.root.firstChild!.text.string, "keep")
    })
})

describe("Outline getRowById", () => {
    const outline = bike.testOutline()

    it("finds existing row by id", () => {
        outline.insertRows(["findme"], outline.root)
        const row = outline.root.firstChild!
        const found = outline.getRowById(row.id)
        assert(found, "should find the row")
        assert.equal(found!.id, row.id)
    })

    it("returns undefined for non-existent id", () => {
        const found = outline.getRowById("non-existent-id-12345")
        assert.equal(found, undefined)
    })
})

describe("Outline transaction", () => {
    const outline = bike.testOutline()

    it("groups changes", () => {
        outline.transaction({ label: "grouped" }, () => {
            outline.insertRows(["tx-1", "tx-2"], outline.root)
        })
        const children = outline.root.children
        const texts = children.map(c => c.text.string)
        assert(texts.includes("tx-1"), "should contain tx-1")
        assert(texts.includes("tx-2"), "should contain tx-2")
    })

    it("returns closure value", () => {
        const result = outline.transaction({ label: "test" }, () => {
            return 42
        })
        assert.equal(result, 42)
    })

    it("accepts 'default' as options", () => {
        outline.transaction("default", () => {
            outline.insertRows(["default-tx"], outline.root)
        })
        assert.equal(outline.root.lastChild!.text.string, "default-tx")
    })
})

describe("Outline constructor", () => {
    it("creates a new empty outline", () => {
        const o = new Outline()
        assert(o.root, "new outline should have a root")
        assert.equal(o.root.children.length, 0)
    })

    it("creates outline from string array", () => {
        const o = new Outline(["one", "two"])
        assert.equal(o.root.children.length, 2)
        assert.equal(o.root.firstChild!.text.string, "one")
    })
})

describe("Outline archive", () => {
    it("archives as bike format", () => {
        const o = new Outline(["archived row"])
        const archive = o.archive("bike")
        assert(archive, "archive should exist")
        assert.equal(archive.format, "bike")
        assert(typeof archive.data === "string", "archive data should be a string")
        assert(archive.data.length > 0, "archive data should not be empty")
    })

    it("archives as plaintext format", () => {
        const o = new Outline(["plain text row"])
        const archive = o.archive("plaintext")
        assert.equal(archive.format, "plaintext")
        assert(archive.data.includes("plain text row"), "plaintext should contain row text")
    })

    it("archives as opml format", () => {
        const o = new Outline(["opml row"])
        const archive = o.archive("opml")
        assert.equal(archive.format, "opml")
        assert(archive.data.length > 0)
    })

    it("can create outline from archive", () => {
        const o1 = new Outline(["round-trip"])
        const archive = o1.archive("bike")
        const o2 = new Outline(archive)
        assert.equal(o2.root.firstChild!.text.string, "round-trip")
    })
})

describe("Outline observeChanges", () => {
    const outline = bike.testOutline()

    it("returns a disposable", () => {
        const disposable = outline.observeChanges(() => {})
        assert(disposable, "should return a disposable")
        assert(typeof disposable.dispose === "function", "should have dispose")
        disposable.dispose()
    })
})