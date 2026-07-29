describe("Priority commands", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Alpha", "Beta", "Gamma"], outline.root)
    })

    it("registers the four priority commands", () => {
        const commands = bike.commands.toString()
        assert(commands.includes("priority:1"), "should register priority:1")
        assert(commands.includes("priority:2"), "should register priority:2")
        assert(commands.includes("priority:3"), "should register priority:3")
        assert(commands.includes("priority:clear"), "should register priority:clear")
    })

    it("sets priority on all selected rows", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("priority:1", { editor }), true)
        assert.equal(rows[0].getAttribute("priority"), "1")
        assert.equal(rows[1].getAttribute("priority"), "1")
        assert(rows[2].getAttribute("priority") == null, "unselected row should be untouched")
    })

    it("overwrites an existing priority", () => {
        const row = outline.root.children[0]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("priority:3", { editor }), true)
        assert.equal(row.getAttribute("priority"), "3")
    })

    it("clears priority from selected rows", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("priority:clear", { editor }), true)
        assert(rows[0].getAttribute("priority") == null, "priority should be cleared")
        assert(rows[1].getAttribute("priority") == null, "priority should be cleared")
    })

    it("priority attribute is queryable for badge/filter paths", () => {
        const row = outline.root.children[2]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("priority:2", { editor }), true)
        // The same path shape the badge `where` and the filter menu use.
        const matched = outline.query('//@priority = "2"') as { type: "elements"; value: any[] }
        assert.equal(matched.type, "elements")
        assert.equal(matched.value.length, 1)
        editor.selectRows(row)
        bike.commands.performCommand("priority:clear", { editor })
    })
})
