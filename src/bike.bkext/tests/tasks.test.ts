// Waits for an off-main summary recompute to land. Summaries fold on a
// background processor with leading-edge emission, so values are eventually
// consistent — poll rather than assert immediately.
async function eventually(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    while (!check()) {
        if (Date.now() - start > timeoutMs) {
            assert(false, "condition not met within " + timeoutMs + "ms")
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
}

describe("Task commands", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        const [project] = outline.insertRows(["Project"], outline.root)
        outline.insertRows(
            [
                { type: "task", text: "Task One" },
                { type: "task", text: "Task Two" },
                { type: "body", text: "Plain note" },
            ],
            project
        )
    })

    it("registers the branch commands", () => {
        const commands = bike.commands.toString()
        assert(commands.includes("tasks:mark-branch-done"), "should register mark-branch-done")
        assert(commands.includes("tasks:clear-branch-done"), "should register clear-branch-done")
        assert(commands.includes("tasks:filter-todo"), "should register filter-todo")
        assert(commands.includes("tasks:filter-done"), "should register filter-done")
        assert(commands.includes("tasks:archive-done"), "should register archive-done")
        assert(commands.includes("tasks:archive-branch-done"), "should register archive-branch-done")
    })

    // NO behavioral test for `tasks:filter-todo` / `tasks:filter-done`
    // yet. Any test that actually applies one of them to this editor makes a
    // LATER session test crash the app: IPCMethods.editorSnapshot sorts
    // `editor.collapsed` through `outline.compare`, which force-unwraps
    // `nodes[id]!` (Tree.swift:130). Setting `editor.filter` from JS is what
    // arms it — the same assignment the task badge menu has always made
    // on click, so this predates these commands. Add coverage once that's
    // fixed on the Swift side.

    it("marks every task in the branch done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:mark-branch-done", { editor }), true)
        const tasks = project.children.filter((row) => row.type === "task")
        assert.equal(tasks.length, 2)
        for (const task of tasks) {
            const done = task.getAttribute("done")
            assert(done != null, "task should be stamped done")
            // Same stamp shape as native Toggle Done: ISO-8601 UTC, no
            // fractional seconds.
            assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(done!), "done stamp should be ISO-8601 UTC: " + done)
        }
        const note = project.children.find((row) => row.type === "body")!
        assert(note.getAttribute("done") == null, "non-task rows should be untouched")
    })

    it("mark done is a no-op when everything is already done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:mark-branch-done", { editor }), false)
    })

    it("marks the branch undone", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:clear-branch-done", { editor }), true)
        for (const task of project.children.filter((row) => row.type === "task")) {
            assert(task.getAttribute("done") == null, "done should be removed")
        }
    })

    it("mark undone is a no-op when nothing is done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:clear-branch-done", { editor }), false)
    })
})

// A row list as one comparable string — `assert` here has no deepEqual, and a
// joined line reads better in a failure than an index-by-index walk.
function texts(rows: { text: { string: string } }[]): string {
    return rows.map((row) => row.text.string).join(", ")
}

describe("Archive done", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    // Project
    //   Task One @done
    //   Task Two
    //   Note @done          <- not a task, still finished work
    //   Task Three @done
    //     Subtask @done     <- nested done, must ride along inside its parent
    //     Loose End         <- not done, travels with the archived branch
    outline.transaction({ label: "setup" }, () => {
        const [project] = outline.insertRows(["Project"], outline.root)
        const [one, , note, three] = outline.insertRows(
            [
                { type: "task", text: "Task One" },
                { type: "task", text: "Task Two" },
                { type: "body", text: "Note" },
                { type: "task", text: "Task Three" },
            ],
            project
        )
        const [subtask] = outline.insertRows(
            [
                { type: "task", text: "Subtask" },
                { type: "task", text: "Loose End" },
            ],
            three
        )
        one.setAttribute("done", "")
        note.setAttribute("done", "")
        three.setAttribute("done", "")
        subtask.setAttribute("done", "")
    })

    it("declines and creates nothing when the branch has nothing done", () => {
        // A row outside Project, with no done rows below it.
        const [other] = outline.transaction({ label: "setup" }, () =>
            outline.insertRows([{ text: "Other" }], outline.root)
        )
        editor.selectRows(other)
        assert.equal(bike.commands.performCommand("tasks:archive-branch-done", { editor }), false)
        assert(outline.getRowById("archive") == null, "no Archive row should exist yet")
    })

    it("archives the branch's done rows, outermost only", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:archive-branch-done", { editor }), true)

        const archive = outline.getRowById("archive")
        assert(archive, "Archive row should have been created")
        assert.equal(archive!.text.string, "Archive")
        assert.equal(archive!.parent!.id, outline.root.id, "Archive belongs at root")

        // Task One, Note, Task Three — NOT Subtask, which is nested under an
        // archived row and moves inside it.
        assert.equal(texts(archive!.children), "Task One, Note, Task Three")

        const three = archive!.lastChild!
        assert.equal(
            texts(three.children),
            "Subtask, Loose End",
            "the archived branch keeps its shape, done children and all"
        )
    })

    it("leaves the branch container and its undone rows in place", () => {
        const project = outline.root.firstChild!
        assert.equal(project.text.string, "Project", "the clicked row itself is never archived")
        assert.equal(texts(project.children), "Task Two")
    })

    it("is a no-op once everything done is already in the Archive", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:archive-branch-done", { editor }), false)
        editor.selectRows(outline.getRowById("archive")!)
        assert.equal(bike.commands.performCommand("tasks:archive-branch-done", { editor }), false)
        assert.equal(bike.commands.performCommand("tasks:archive-done", { editor }), false)
    })

    it("reuses the existing Archive and sweeps the whole outline", () => {
        const project = outline.root.firstChild!
        const archiveBefore = outline.getRowById("archive")!
        const archivedBefore = archiveBefore.children.length

        // Done rows in two different branches — the whole-outline command takes
        // both, where the branch command would only have taken Project's.
        outline.transaction({ label: "setup" }, () => {
            project.firstChild!.setAttribute("done", "")
            const [elsewhere] = outline.insertRows([{ type: "task", text: "Elsewhere" }], outline.root)
            elsewhere.setAttribute("done", "")
        })

        assert.equal(bike.commands.performCommand("tasks:archive-done", { editor }), true)

        const archive = outline.getRowById("archive")!
        assert.equal(archive.id, archiveBefore.id, "should reuse the existing Archive, not make a second")
        assert.equal(
            outline.root.children.filter((row) => row.persistentId === "archive").length,
            1
        )
        assert.equal(
            texts(archive.children.slice(archivedBefore)),
            "Task Two, Elsewhere",
            "new sweeps stack at the end of the Archive"
        )
    })

    it("declines on the whole outline when nothing is left to archive", () => {
        assert.equal(bike.commands.performCommand("tasks:archive-done", { editor }), false)
    })
})

describe("Task summaries", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        const [project] = outline.insertRows(["Summary Project"], outline.root)
        outline.insertRows(
            [
                { type: "task", text: "S Task One" },
                { type: "task", text: "S Task Two" },
                { type: "task", text: "S Task Three" },
            ],
            project
        )
    })

    it("summary('todo') resolves as a scalar in queries", async () => {
        await eventually(() => {
            const result = outline.query('summary("todo")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
    })

    it("summary predicates match rows — the badge `where` shape", async () => {
        // Rows with more than one task below them: only the project row.
        await eventually(() => {
            const result = outline.query('//summary("todo") > 1') as { type: string; value: any[] }
            return result.type === "elements" && result.value.length === 1
        })
    })

    it("summary('done') counts task rows only", async () => {
        // A non-task row marked @done is completion history, not task
        // progress — it must not push done past total in the badge fraction.
        const project = outline.root.firstChild!
        outline.transaction({ label: "setup" }, () => {
            const [note] = outline.insertRows(["S Note"], project)
            note.setAttribute("done", "")
            project.firstChild!.setAttribute("done", "")
        })
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 1
        })
        outline.transaction({ label: "teardown" }, () => {
            outline.removeRows([project.lastChild!])
            project.firstChild!.removeAttribute("done")
        })
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 0
        })
    })

    it("summary('done') tracks @done edits", async () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:mark-branch-done", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("tasks:clear-branch-done", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 0
        })
    })
})
