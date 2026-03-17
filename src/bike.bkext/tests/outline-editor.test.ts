describe("OutlineEditor basics", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    it("has outline reference", () => {
        assert.equal(editor.outline.root.id, outline.root.id)
    })

    it("has focus defaulting to root", () => {
        assert.equal(editor.focus.id, outline.root.id)
    })

    it("has transaction function", () => {
        assert(typeof editor.transaction === "function")
    })

    it("has showStatusMessage function", () => {
        assert(typeof editor.showStatusMessage === "function")
    })
})

describe("OutlineEditor focus", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Focus A", "Focus B", "Focus C"], outline.root)
        outline.insertRows(["Focus A1", "Focus A2"], outline.root.firstChild!)
    })

    it("can set focus to a row", () => {
        const row = outline.root.firstChild!
        editor.focus = row
        assert.equal(editor.focus.id, row.id)
        editor.focus = outline.root
    })

    it("isFocused returns true for visible rows", () => {
        const row = outline.root.firstChild!
        assert(editor.isFocused(row), "top-level row should be focused")
    })

    it("prevFocused and nextFocused navigate", () => {
        const rows = outline.root.children
        const next = editor.nextFocused(rows[0])
        assert(next, "should have next focused")

        const prev = editor.prevFocused(rows[1])
        assert(prev, "should have prev focused")
    })
})

describe("OutlineEditor filter", () => {
    const editor = bike.testEditor()

    it("filter is initially undefined", () => {
        assert.equal(editor.filter, undefined)
    })

    it("can set filter", () => {
        editor.filter = "//heading"
        assert.equal(editor.filter, "//heading")
        editor.filter = undefined as any
    })
})

describe("OutlineEditor expand/collapse", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Parent"], outline.root)
        outline.insertRows(["Child 1", "Child 2"], outline.root.firstChild!)
    })

    it("rows default to expanded", () => {
        const row = outline.root.firstChild!
        assert(editor.isExpanded(row), "row should default to expanded")
        assert(!editor.isCollapsed(row), "row should not be collapsed")
    })

    it("can collapse a row", () => {
        const row = outline.root.firstChild!
        editor.collapse([row])
        assert(editor.isCollapsed(row), "row should be collapsed")
        assert(!editor.isExpanded(row), "row should not be expanded")
    })

    it("can expand a row", () => {
        const row = outline.root.firstChild!
        editor.expand([row])
        assert(editor.isExpanded(row), "row should be expanded")
    })

    it("can collapse completely", () => {
        const row = outline.root.firstChild!
        editor.collapse([row], "completely")
        assert(editor.isCollapsed(row))
        editor.expand([row], "completely")
    })
})

describe("OutlineEditor selection", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.insertRows(["Select A", "Select B", "Select C"], outline.root)

    it("can create caret selection", () => {
        const row = outline.root.firstChild!
        editor.selectCaret(row, 0)
        const sel = editor.selection
        assert(sel, "selection should exist")
        assert.equal(sel!.type, "caret")
        assert.equal(sel!.row.id, row.id)
        if (sel!.type === "caret") {
            assert.equal(sel!.detail.char, 0)
        }
    })

    it("caret selection has word and sentence", () => {
        const sel = editor.selection!
        assert(typeof sel.word === "string", "word should be a string")
        assert(typeof sel.sentence === "string", "sentence should be a string")
    })

    it("can create text selection", () => {
        const row = outline.root.firstChild!
        editor.selectText(row, 0, 5)
        const sel = editor.selection
        assert(sel, "selection should exist")
        assert.equal(sel!.type, "text")
        if (sel!.type === "text") {
            assert.equal(sel!.detail.anchorChar, 0)
            assert.equal(sel!.detail.headChar, 5)
            assert(sel!.detail.text, "should have selected text")
            assert.equal(sel!.detail.range[0], 0)
            assert.equal(sel!.detail.range[1], 5)
        }
    })

    it("text selection has rows", () => {
        const sel = editor.selection!
        assert(Array.isArray(sel.rows), "rows should be an array")
        assert.equal(sel.rows.length, 1)
    })

    it("can create block selection", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        const sel = editor.selection
        assert(sel, "selection should exist")
        assert.equal(sel!.type, "block")
        if (sel!.type === "block") {
            assert.equal(sel!.detail.anchorRow.id, rows[0].id)
            assert.equal(sel!.detail.headRow.id, rows[1].id)
        }
    })

    it("block selection has rows and coverRows", () => {
        const sel = editor.selection!
        assert(Array.isArray(sel.rows), "rows should be an array")
        assert(sel.rows.length >= 2, "should have at least 2 rows")
        assert(Array.isArray(sel.coverRows), "coverRows should be an array")
    })

    it("block selection has startRow and endRow", () => {
        const sel = editor.selection!
        if (sel!.type === "block") {
            assert(sel!.detail.startRow, "should have startRow")
            assert(sel!.detail.endRow, "should have endRow")
        }
    })

    it("can observe selection", () => {
        const disposable = editor.observeSelection(() => {})
        assert(disposable, "should return a disposable")
        assert(typeof disposable.dispose === "function")
        disposable.dispose()
    })
})

describe("OutlineEditor revealRow", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.insertRows(["Reveal me"], outline.root)

    it("can reveal a row", () => {
        const row = outline.root.firstChild!
        editor.revealRow(row)
    })

    it("can reveal with children", () => {
        const row = outline.root.firstChild!
        editor.revealRow(row, true)
    })
})

describe("OutlineEditor showStatusMessage", () => {
    const editor = bike.testEditor()

    it("returns a disposable", () => {
        const disposable = editor.showStatusMessage("test message", 100)
        assert(disposable, "should return a disposable")
        assert(typeof disposable.dispose === "function")
        disposable.dispose()
    })
})

describe("OutlineEditor transaction", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    it("groups changes with animation options", () => {
        editor.transaction({ animate: "none" }, () => {
            outline.insertRows(["editor-tx"], outline.root)
        })
        assert.equal(outline.root.lastChild!.text.string, "editor-tx")
    })
})