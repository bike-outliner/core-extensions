describe("Flagged commands", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Alpha", "Beta", "Gamma"], outline.root)
    })

    it("registers a command per color, plus toggle/clear/filter", () => {
        const commands = bike.commands.toString()
        for (const color of ["orange", "red", "purple", "blue", "yellow", "green", "gray"]) {
            assert(commands.includes("flagged:" + color), "should register flagged:" + color)
        }
        assert(commands.includes("flagged:toggle"), "should register flagged:toggle")
        assert(commands.includes("flagged:remove"), "should register flagged:remove")
        assert(commands.includes("flagged:filter"), "should register flagged:filter")
    })

    it("sets a color on all selected rows", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("flagged:blue", { editor }), true)
        assert.equal(rows[0].getAttribute("flagged"), "blue")
        assert.equal(rows[1].getAttribute("flagged"), "blue")
        assert(rows[2].getAttribute("flagged") == null, "unselected row should be untouched")
    })

    it("overwrites an existing color — a setter sets, it doesn't toggle", () => {
        const row = outline.root.children[0]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("flagged:red", { editor }), true)
        assert.equal(row.getAttribute("flagged"), "red")
        // Re-running reports success but writes nothing.
        assert.equal(bike.commands.performCommand("flagged:red", { editor }), true)
        assert.equal(row.getAttribute("flagged"), "red")
    })

    it("clears flags from the selection, and declines when there's nothing to clear", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("flagged:remove", { editor }), true)
        assert(rows[0].getAttribute("flagged") == null, "flag should be cleared")
        assert(rows[1].getAttribute("flagged") == null, "flag should be cleared")
        // Nothing left to clear, so it declines.
        assert.equal(bike.commands.performCommand("flagged:remove", { editor }), false)
    })

    it("toggle raises a valueless flag, then lowers it", () => {
        const row = outline.root.children[0]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("flagged:toggle", { editor }), true)
        // Valueless; the badge draws it red.
        assert.equal(row.getAttribute("flagged"), "")
        assert.equal(bike.commands.performCommand("flagged:toggle", { editor }), true)
        assert(row.getAttribute("flagged") == null, "second toggle should lower the flag")
    })

    it("toggle converges a mixed selection instead of inverting it", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0])
        bike.commands.performCommand("flagged:green", { editor })
        // rows[0] flagged, rows[1] not: not every row has one, so all get one.
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("flagged:toggle", { editor }), true)
        assert.equal(rows[0].getAttribute("flagged"), "", "an existing color is replaced by the valueless flag")
        assert.equal(rows[1].getAttribute("flagged"), "")
        // Now every row has one, so the next toggle lowers them all.
        assert.equal(bike.commands.performCommand("flagged:toggle", { editor }), true)
        assert(rows[0].getAttribute("flagged") == null, "all flags should be lowered")
        assert(rows[1].getAttribute("flagged") == null, "all flags should be lowered")
    })

    it("flagged is queryable on the filter command's path", () => {
        const rows = outline.root.children
        editor.selectRows(rows[2])
        assert.equal(bike.commands.performCommand("flagged:purple", { editor }), true)
        // The exact path `flagged:filter` filters on.
        const open = outline.query('//(@flagged and open())') as { type: string; value: any[] }
        assert.equal(open.type, "elements")
        assert.equal(open.value.length, 1)
        // The filter drops closed rows.
        outline.transaction({ label: "finish" }, () => rows[2].setAttribute("status", "done"))
        const afterDone = outline.query('//(@flagged and open())') as { type: string; value: any[] }
        assert.equal(afterDone.value.length, 0)
        outline.transaction({ label: "teardown" }, () => {
            rows[2].removeAttribute("status")
            rows[2].removeAttribute("flagged")
        })
    })
})
