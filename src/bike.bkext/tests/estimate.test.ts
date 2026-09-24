// Remaining-estimate summaries emit ISO durations: `remainingestimate`
// (descendant-or-self) is the Σ value, `remainingbelow` (descendant) the gate.
// `duration()` converts to seconds.

describe("Estimate commands", () => {
    const editor = bike.testEditor()
    const outline = editor.outline

    outline.transaction({ label: "setup" }, () => {
        outline.insertRows(["Alpha", "Beta"], outline.root)
    })

    it("registers set/clear/filter", () => {
        const commands = bike.commands.toString()
        for (const name of ["estimate:set", "estimate:clear", "estimate:filter"]) {
            assert(commands.includes(name), "should register " + name)
        }
    })

    it("clears estimates, then declines when there's nothing to clear", () => {
        const rows = outline.root.children
        outline.transaction({ label: "seed" }, () => {
            rows[0].setAttribute("estimate", "PT1H")
            rows[1].setAttribute("estimate", "PT30M")
        })
        editor.selectRows(rows[0], rows[1])
        assert.equal(bike.commands.performCommand("estimate:clear", { editor }), true)
        assert(rows[0].getAttribute("estimate") == null, "estimate should be cleared")
        assert(rows[1].getAttribute("estimate") == null, "estimate should be cleared")
        assert.equal(bike.commands.performCommand("estimate:clear", { editor }), false)
    })

    it("the filter path counts open estimated items only", () => {
        const rows = outline.root.children
        const path = "//(@estimate and open())"
        outline.transaction({ label: "seed" }, () => rows[0].setAttribute("estimate", "PT1H"))
        assert.equal((outline.query(`count(${path})`) as { value: number }).value, 1)
        outline.transaction({ label: "finish" }, () => rows[0].setAttribute("status", "done"))
        assert.equal((outline.query(`count(${path})`) as { value: number }).value, 0)
        outline.transaction({ label: "teardown" }, () => {
            rows[0].removeAttribute("status")
            rows[0].removeAttribute("estimate")
        })
    })
})

describe("Estimate remaining summaries", () => {
    // Summaries are eventually consistent, so poll. Scoped here because test
    // files share one global script and tasks.test.ts has its own copy.
    async function eventually(check: () => boolean, timeoutMs = 5000): Promise<void> {
        const start = Date.now()
        while (!check()) {
            if (Date.now() - start > timeoutMs) {
                assert(false, "condition not met within " + timeoutMs + "ms")
            }
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
    }

    const editor = bike.testEditor()
    const outline = editor.outline
    let project: import('bike/app').Row
    let one: import('bike/app').Row

    outline.transaction({ label: "setup" }, () => {
        ;[project] = outline.insertRows(["Estimated Project"], outline.root)
        const rows = outline.insertRows(["One", "Two"], project)
        one = rows[0]
        const two = rows[1]
        project.setAttribute("estimate", "PT15M")
        one.setAttribute("estimate", "PT1H")
        two.setAttribute("estimate", "PT30M")
        two.setAttribute("status", "done")
    })

    it("summary('remainingestimate') totals the branch's open estimates, as wire ISO", async () => {
        // Closed Two's PT30M doesn't count.
        await eventually(() => {
            const result = outline.query('summary("remainingestimate")') as { type: string; value: string }
            return result.type === "string" && result.value === "PT1H15M"
        })
    })

    it("duration(summary(...)) unwraps the ISO emission to seconds", async () => {
        // A raw ISO summary in a comparison is NaN and never matches.
        await eventually(() => {
            const result = outline.query('duration(summary("remainingestimate"))') as { type: string; value: number }
            return result.type === "number" && result.value === 4500
        })
    })

    it("summary('remainingbelow') gates on descendants only", async () => {
        // Only the project has open estimated work below it.
        await eventually(() => {
            const result = outline.query('count(//(duration(summary("remainingbelow")) > 0))') as {
                type: string
                value: number
            }
            return result.type === "number" && result.value === 1
        })
    })

    it("drains to nothing once the branch completes (the badge gate closes)", async () => {
        outline.transaction({ label: "finish" }, () => {
            project.setAttribute("status", "done")
            one.setAttribute("status", "done")
        })
        // query() rejects top-level comparisons, so apply the gate here.
        await eventually(() => {
            const result = outline.query('duration(summary("remainingbelow"))') as { type: string; value: number }
            return !(result.value > 0)
        })
    })
})
