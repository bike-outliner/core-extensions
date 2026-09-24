// Summaries recompute off-main and are eventually consistent, so poll.
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
        assert(commands.includes("task:mark-branch-done"), "should register mark-branch-done")
        assert(commands.includes("task:reopen-branch"), "should register reopen-branch")
        assert(commands.includes("task:filter-open"), "should register filter-open")
        assert(commands.includes("task:filter-closed"), "should register filter-closed")
        assert(commands.includes("task:archive-closed"), "should register archive-closed")
        assert(commands.includes("task:archive-branch-closed"), "should register archive-branch-closed")
    })

    // No behavioral test for `task:filter-open`/`-closed` yet: setting
    // `editor.filter` from JS makes a later session test crash
    // (IPCMethods.editorSnapshot → `outline.compare` force-unwrap,
    // Tree.swift:130). Add coverage once fixed.

    it("marks every task in the branch done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:mark-branch-done", { editor }), true)
        const tasks = project.children.filter((row) => row.type === "task")
        assert.equal(tasks.length, 2)
        for (const task of tasks) {
            assert.equal(task.getAttribute("status"), "done", "task should be marked done")
        }
        const note = project.children.find((row) => row.type === "body")!
        assert(note.getAttribute("status") == null, "non-task rows should be untouched")
    })

    it("mark done is a no-op when everything is already done", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:mark-branch-done", { editor }), false)
    })

    it("reopens the branch", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:reopen-branch", { editor }), true)
        for (const task of project.children.filter((row) => row.type === "task")) {
            assert(task.getAttribute("status") == null, "status should be removed")
        }
    })

    it("reopen is a no-op when nothing is closed", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:reopen-branch", { editor }), false)
    })

    it("branch commands record history like any other writer", () => {
        // The host derives the log entry and clock-out from the transition,
        // whichever surface wrote `status`.
        const project = outline.root.firstChild!
        const task = project.children.find((row) => row.type === "task")!
        editor.selectRows(task)
        assert.equal(bike.commands.performCommand("row:create-log", { editor }), true)
        // Hidden `clock:.in` while the feature is held back; still performable.
        assert.equal(bike.commands.performCommand("clock:.in", { editor }), true)

        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:mark-branch-done", { editor }), true)

        const entries = task.log?.children ?? []
        const state = entries.filter((row) => row.getAttribute("log-status") != null)
        const clocks = entries.filter((row) => (row.getAttribute("clock-duration") ?? "") !== "")
        assert.equal(state[state.length - 1]?.getAttribute("log-status"), "done", "the close was recorded")
        assert.equal(clocks.length, 1, "the running clock was stopped, not left open")

        // Reopen through the same path records too.
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:reopen-branch", { editor }), true)
        const afterReopen = (task.log?.children ?? []).filter((row) => row.getAttribute("log-status") === "todo")
        assert(afterReopen.length > 0, "the reopen was recorded")

        // Teardown: drop the log so later suites see the original shape.
        const log = task.log
        assert(log != null, "the task should have a log to remove")
        outline.removeRows([log!])
    })

    it("leaves canceled tasks alone when marking a branch done", () => {
        // Canceled is closed and left alone.
        const project = outline.root.firstChild!
        const task = project.children.find((row) => row.type === "task")!
        outline.transaction({ label: "cancel" }, () => task.setAttribute("status", "canceled"))
        editor.selectRows(project)
        bike.commands.performCommand("task:mark-branch-done", { editor })
        assert.equal(task.getAttribute("status"), "canceled")
    })
})

// `assert` has no deepEqual, so compare joined strings.
function texts(rows: { text: { string: string } }[]): string {
    return rows.map((row) => row.text.string).join(", ")
}

describe("Archive closed", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    // Project
    //   Task One      done
    //   Task Two
    //   Note          done      <- not a task, still finished work
    //   Task Three    canceled  <- closed, however it ended
    //     Subtask     done      <- nested, must ride along inside its parent
    //     Loose End             <- open, travels with the archived branch
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
        one.setAttribute("status", "done")
        note.setAttribute("status", "done")
        // Canceled archives too — the sweep is about closed, not completed.
        three.setAttribute("status", "canceled")
        subtask.setAttribute("status", "done")
    })

    it("declines and creates nothing when the branch has nothing done", () => {
        // A row outside Project, with no done rows below it.
        const [other] = outline.transaction({ label: "setup" }, () =>
            outline.insertRows([{ text: "Other" }], outline.root)
        )
        editor.selectRows(other)
        assert.equal(bike.commands.performCommand("task:archive-branch-closed", { editor }), false)
        assert(outline.getRowById("archive") == null, "no Archive row should exist yet")
    })

    it("archives the branch's done rows, outermost only", () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:archive-branch-closed", { editor }), true)

        const archive = outline.getRowById("archive")
        assert(archive, "Archive row should have been created")
        assert.equal(archive!.text.string, "Archive")
        assert.equal(archive!.parent!.id, outline.root.id, "Archive belongs at root")

        // Not Subtask, which moves inside its archived parent.
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
        assert.equal(bike.commands.performCommand("task:archive-branch-closed", { editor }), false)
        editor.selectRows(outline.getRowById("archive")!)
        assert.equal(bike.commands.performCommand("task:archive-branch-closed", { editor }), false)
        assert.equal(bike.commands.performCommand("task:archive-closed", { editor }), false)
    })

    it("reuses the existing Archive and sweeps the whole outline", () => {
        const project = outline.root.firstChild!
        const archiveBefore = outline.getRowById("archive")!
        const archivedBefore = archiveBefore.children.length

        // Done rows in two branches; the whole-outline command takes both.
        outline.transaction({ label: "setup" }, () => {
            project.firstChild!.setAttribute("status", "done")
            const [elsewhere] = outline.insertRows([{ type: "task", text: "Elsewhere" }], outline.root)
            elsewhere.setAttribute("status", "done")
        })

        assert.equal(bike.commands.performCommand("task:archive-closed", { editor }), true)

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
        assert.equal(bike.commands.performCommand("task:archive-closed", { editor }), false)
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

    it("summary('open') resolves as a scalar in queries", async () => {
        await eventually(() => {
            const result = outline.query('summary("open")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
    })

    it("summary predicates match rows — the badge `where` shape", async () => {
        // Rows with more than one task below them: only the project row.
        await eventually(() => {
            const result = outline.query('//summary("open") > 1') as { type: string; value: any[] }
            return result.type === "elements" && result.value.length === 1
        })
    })

    it("summary('done') counts task rows only", async () => {
        // A closed non-task row must not push done past total.
        const project = outline.root.firstChild!
        outline.transaction({ label: "setup" }, () => {
            const [note] = outline.insertRows(["S Note"], project)
            note.setAttribute("status", "done")
            project.firstChild!.setAttribute("status", "done")
        })
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 1
        })
        outline.transaction({ label: "teardown" }, () => {
            outline.removeRows([project.lastChild!])
            project.firstChild!.removeAttribute("status")
        })
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 0
        })
    })

    // Parked while `CLOCK_BADGES` (app/features/clock.ts) is off; there's no
    // `it.skip`, so this keeps them type-checked. Swap back to `it` when it ships.
    const itParked = (_name: string, _fn: () => void | Promise<void>) => {}

    itParked("summary('clocked') sums recorded intervals below a row", async () => {
        const project = outline.root.firstChild!
        const task = project.children.find((row) => row.type === "task")!
        outline.transaction({ label: "setup" }, () => {
            const log = task.ensureLog()
            const [a, b] = outline.insertRows(
                [
                    { text: "Clocked out" },
                    { text: "Clocked out" },
                ],
                log
            )
            a.setAttribute("log-date", "2026-08-13T15:00:00Z")
            a.setAttribute("clock-duration", "PT1H")
            b.setAttribute("log-date", "2026-08-13T16:30:00Z")
            b.setAttribute("clock-duration", "PT30M")
        })
        await eventually(() => {
            const result = outline.query('duration(summary("clocked"))') as { type: string; value: number }
            return result.type === "number" && result.value === 5400
        })
        outline.transaction({ label: "teardown" }, () => {
            outline.removeRows(task.children.filter((row) => row.type === "log"))
        })
    })

    itParked("the running-clock summaries describe an open interval", async () => {
        // Live elapsed is `count * now() - starts`, evaluated at the badge.
        const project = outline.root.firstChild!
        const task = project.children.find((row) => row.type === "task")!
        outline.transaction({ label: "setup" }, () => {
            const log = task.ensureLog()
            const [running] = outline.insertRows([{ text: "Clocked in" }], log)
            running.setAttribute("log-date", "2026-08-13T15:00:00Z")
            // Present but empty: still running.
            running.setAttribute("clock-duration", "")
        })
        await eventually(() => {
            const count = outline.query('summary("clockrunning")') as { type: string; value: number }
            return count.type === "number" && count.value === 1
        })
        await eventually(() => {
            const drift = outline.query(
                'summary("clockstarted") - date("2026-08-13T15:00:00Z")'
            ) as { type: string; value: number }
            return drift.type === "number" && drift.value === 0
        })
        // An open interval records no duration.
        const clocked = outline.query('duration(summary("clocked"))') as { type: string; value: number }
        assert.equal(clocked.value, 0)
        outline.transaction({ label: "teardown" }, () => {
            outline.removeRows(task.children.filter((row) => row.type === "log"))
        })
    })

    it("summary('done') tracks status edits", async () => {
        const project = outline.root.firstChild!
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:mark-branch-done", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 3
        })
        editor.selectRows(project)
        assert.equal(bike.commands.performCommand("task:reopen-branch", { editor }), true)
        await eventually(() => {
            const result = outline.query('summary("done")') as { type: string; value: number }
            return result.type === "number" && result.value === 0
        })
    })
})
