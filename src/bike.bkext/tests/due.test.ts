// `due:today` / `due:tomorrow` / `due:soon` are the zero-dialog setters —
// what `priority:1/2/3` are to the priority menu. They write DATE-ONLY wire
// values; a timed `@due` is a different thing (what scripts write) and the
// badge renders it differently.

describe("Due commands", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    // The same local-day date-only encoding the commands use, computed here
    // independently so the test doesn't just restate the implementation.
    function localDay(offset: number): string {
        const day = new Date()
        day.setDate(day.getDate() + offset)
        const pad = (n: number) => String(n).padStart(2, "0")
        return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    }

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Alpha", "Beta", "Gamma"], outline.root)
    })

    it("registers the setters alongside set/clear/filter", () => {
        const commands = bike.commands.toString()
        for (const name of ["due:set", "due:today", "due:tomorrow", "due:soon", "due:clear", "due:filter"]) {
            assert(commands.includes(name), "should register " + name)
        }
    })

    it("due:today writes a date-only value for the local day", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("due:today", { editor }), true)
        assert.equal(rows[0].getAttribute("due"), localDay(0))
        assert.equal(rows[1].getAttribute("due"), localDay(0))
        assert(rows[2].getAttribute("due") == null, "unselected row should be untouched")
    })

    it("due:tomorrow is the next local day, still date-only", () => {
        const row = outline.root.children[0]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("due:tomorrow", { editor }), true)
        assert.equal(row.getAttribute("due"), localDay(1))
        // No time component — `T` would change how the badge reads it.
        assert(!row.getAttribute("due")!.includes("T"), "due day should carry no time")
    })

    it("due:soon writes the valueless 'due, but no date yet' state", () => {
        const row = outline.root.children[0]
        editor.selectRows(row)
        assert.equal(bike.commands.performCommand("due:soon", { editor }), true)
        assert.equal(row.getAttribute("due"), "")
        // Present-but-empty: `@due` still matches, which is what makes the
        // row show up in the badge and the filter.
        const matched = outline.query("//@due") as { type: string; value: any[] }
        assert(matched.value.length > 0, "a valueless @due should still match @due")
    })

    it("due:clear removes it, then declines when there's nothing to clear", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("due:clear", { editor }), true)
        assert(rows[0].getAttribute("due") == null, "due should be cleared")
        assert(rows[1].getAttribute("due") == null, "due should be cleared")
        assert.equal(bike.commands.performCommand("due:clear", { editor }), false)
    })

    it("the filter path counts open due items only", () => {
        const rows = outline.root.children
        editor.selectRows(rows[0])
        bike.commands.performCommand("due:today", { editor })
        const path = "//(@due and not @done)"
        assert.equal((outline.query(`count(${path})`) as { value: number }).value, 1)
        // A completed row's due is history.
        outline.transaction({ label: "finish" }, () => rows[0].setAttribute("done", ""))
        assert.equal((outline.query(`count(${path})`) as { value: number }).value, 0)
        outline.transaction({ label: "teardown" }, () => {
            rows[0].removeAttribute("done")
            rows[0].removeAttribute("due")
        })
    })
})
