// The remaining-estimate summaries are duration-TYPED: they sum open
// estimates in the native duration encoding and re-emit wire ISO, which the
// localizable native formatter can display directly. Two axes for two jobs:
// `remainingestimate` (descendant-or-self) is the Σ badge's VALUE — the
// branch total including the row's own open estimate — and `remainingbelow`
// (descendant) is its GATE. The `duration()` wrapper is how numeric read
// sites get seconds back out.

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
        // Done work is spent, not remaining — the same split the summaries make.
        outline.transaction({ label: "finish" }, () => rows[0].setAttribute("status", "done"))
        assert.equal((outline.query(`count(${path})`) as { value: number }).value, 0)
        outline.transaction({ label: "teardown" }, () => {
            rows[0].removeAttribute("status")
            rows[0].removeAttribute("estimate")
        })
    })
})

describe("Estimate remaining summaries", () => {
    // Waits for an off-main summary recompute to land. Summaries fold on a
    // background processor with leading-edge emission, so values are
    // eventually consistent — poll rather than assert immediately. (Scoped
    // here: test files compile as one global script, and tasks.test.ts
    // declares its own copy.)
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
        // Project's own PT15M and One's PT1H count; closed Two's PT30M is
        // spent, not remaining.
        await eventually(() => {
            const result = outline.query('summary("remainingestimate")') as { type: string; value: string }
            return result.type === "string" && result.value === "PT1H15M"
        })
    })

    it("duration(summary(...)) unwraps the ISO emission to seconds", async () => {
        // The shape the Σ badge's `> 0` gate depends on — a RAW ISO summary
        // in a comparison would coerce to NaN and silently never match.
        await eventually(() => {
            const result = outline.query('duration(summary("remainingestimate"))') as { type: string; value: number }
            return result.type === "number" && result.value === 4500
        })
    })

    it("summary('remainingbelow') gates on descendants only", async () => {
        // Only the project has open estimated work BELOW it — its leaves
        // don't, so only the project would carry the Σ badge.
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
        // query() rejects top-level comparisons, so read the seconds and
        // apply the badge's gate here — an empty emission reads as NaN, a
        // zero sum as 0; the gate is closed either way.
        await eventually(() => {
            const result = outline.query('duration(summary("remainingbelow"))') as { type: string; value: number }
            return !(result.value > 0)
        })
    })
})
