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

describe("Progress commands", () => {
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
        assert(commands.includes("progress:mark-branch-done"), "should register mark-branch-done")
        assert(commands.includes("progress:clear-branch-done"), "should register clear-branch-done")
    })

    it("marks every task in the branch done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("progress:mark-branch-done", { editor }), true)
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
        assert.equal(bike.commands.performCommand("progress:mark-branch-done", { editor }), false)
    })

    it("marks the branch undone", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("progress:clear-branch-done", { editor }), true)
        for (const task of project.children.filter((row) => row.type === "task")) {
            assert(task.getAttribute("done") == null, "done should be removed")
        }
    })

    it("mark undone is a no-op when nothing is done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("progress:clear-branch-done", { editor }), false)
    })
})

describe("Progress summaries", () => {
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

    it("summary('tasks') resolves as a scalar in queries", async () => {
        await eventually(() => {
            const result = outline.query('summary("tasks")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
    })

    it("summary predicates match rows — the badge `where` shape", async () => {
        // Rows with more than one task below them: only the project row.
        await eventually(() => {
            const result = outline.query('//summary("tasks") > 1') as { type: string; value: any[] }
            return result.type === "elements" && result.value.length === 1
        })
    })

    it("summary('doneTasks') tracks @done edits", async () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("progress:mark-branch-done", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("doneTasks")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("progress:clear-branch-done", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("doneTasks")') as { type: string; value: number }
            return result.type === "number" && result.value === 0
        })
    })
})
