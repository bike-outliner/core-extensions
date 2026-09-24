describe("bike.screens", () => {
    it("is a non-empty array", () => {
        assert(Array.isArray(bike.screens), "screens should be an array")
        assert(bike.screens.length > 0, "should have at least one screen")
    })

    it("entries have a stable id string", () => {
        for (const s of bike.screens) {
            assert(typeof s.id === "string", "screen.id should be a string")
            assert(s.id.length > 0, "screen.id should not be empty")
        }
    })

    it("entries have a localized name", () => {
        for (const s of bike.screens) {
            assert(typeof s.name === "string", "screen.name should be a string")
        }
    })

    it("entries have a positive scale", () => {
        for (const s of bike.screens) {
            assert(typeof s.scale === "number", "screen.scale should be a number")
            assert(s.scale > 0, "screen.scale should be > 0")
        }
    })

    it("entries have a frame with positive size", () => {
        for (const s of bike.screens) {
            assert(typeof s.frame.x === "number")
            assert(typeof s.frame.y === "number")
            assert(typeof s.frame.width === "number")
            assert(typeof s.frame.height === "number")
            assert(s.frame.width > 0, "frame.width should be > 0")
            assert(s.frame.height > 0, "frame.height should be > 0")
        }
    })

    it("entries have a visibleFrame contained in frame", () => {
        for (const s of bike.screens) {
            assert(typeof s.visibleFrame.x === "number")
            assert(typeof s.visibleFrame.y === "number")
            assert(typeof s.visibleFrame.width === "number")
            assert(typeof s.visibleFrame.height === "number")
            assert(s.visibleFrame.width > 0, "visibleFrame.width should be > 0")
            assert(s.visibleFrame.height > 0, "visibleFrame.height should be > 0")
            assert(s.visibleFrame.width <= s.frame.width,
                "visibleFrame.width should be <= frame.width")
            assert(s.visibleFrame.height <= s.frame.height,
                "visibleFrame.height should be <= frame.height")
            assert(s.visibleFrame.x >= s.frame.x,
                "visibleFrame.x should be >= frame.x")
            assert(s.visibleFrame.y >= s.frame.y,
                "visibleFrame.y should be >= frame.y")
        }
    })

    it("primary screen has frame origin (0, 0)", () => {
        // NSScreen.screens[0] is the screen whose origin is (0, 0).
        assert.equal(bike.screens[0].frame.x, 0)
        assert.equal(bike.screens[0].frame.y, 0)
    })

    it("ids are unique across screens", () => {
        const ids = bike.screens.map(s => s.id)
        assert.equal(new Set(ids).size, ids.length, "screen ids should be unique")
    })
})

describe("bike.mainScreen", () => {
    it("exists", () => {
        assert(bike.mainScreen, "mainScreen should be defined")
    })

    it("matches one of bike.screens by id", () => {
        const ids = bike.screens.map(s => s.id)
        assert(ids.includes(bike.mainScreen.id),
            "mainScreen.id should be present in bike.screens")
    })

    it("has the same shape as a screen entry", () => {
        const m = bike.mainScreen
        assert(typeof m.id === "string")
        assert(typeof m.name === "string")
        assert(typeof m.scale === "number")
        assert(typeof m.frame.width === "number")
        assert(typeof m.visibleFrame.width === "number")
    })
})

describe("Window.screen", () => {
    it("frontmost window reports a screen", () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")
        const s = window!.screen
        assert(s, "frontmost window should be on a screen")
        assert(typeof s!.id === "string")
        assert(s!.frame.width > 0)
    })

    it("window.screen id matches one of bike.screens", () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")
        const s = window!.screen
        assert(s, "window.screen should be defined")
        const ids = bike.screens.map(x => x.id)
        assert(ids.includes(s!.id), "window.screen.id should be in bike.screens")
    })
})

describe("showPanel screen positioning", () => {
    const domScript = `
        var extensionExports = { activate: function(context) {
            context.postMessage({ type: "ready" })
        }}
    `

    it("accepts a frame option", async () => {
        const v = bike.mainScreen.visibleFrame
        const handle = await bike.showPanel({
            script: domScript,
            title: "Positioned Panel",
            frame: { x: v.x + 50, y: v.y + 50, width: 200, height: 150 },
        })
        assert(handle, "Expected a handle from positioned showPanel")
        await new Promise<any>((resolve) => {
            handle.onmessage = (m: any) => resolve(m)
        })
        handle.dispose()
    })

    it("targets a specific screen via frame coordinates", async () => {
        // To target a screen, pass an origin within its frame.
        const v = bike.mainScreen.frame
        const handle = await bike.showPanel({
            script: domScript,
            title: "Screen-Targeted Panel",
            frame: { x: v.x + 20, y: v.y + 20, width: 200, height: 150 },
        })
        assert(handle, "Expected a handle from screen-targeted showPanel")
        await new Promise<any>((resolve) => {
            handle.onmessage = (m: any) => resolve(m)
        })
        handle.dispose()
    })

    it("opens a panel covering the right two-thirds of mainScreen", async () => {
        // 1/3 ⇄ 2/3 split.
        const v = bike.mainScreen.visibleFrame
        const handle = await bike.showPanel({
            script: domScript,
            title: "Right Two-Thirds",
            frame: {
                x: v.x + v.width / 3,
                y: v.y,
                width: (v.width * 2) / 3,
                height: v.height,
            },
        })
        await new Promise<any>((resolve) => {
            handle.onmessage = (m: any) => resolve(m)
        })
        handle.dispose()
    })
})

describe("Window.frame", () => {
    it("reads a Rect with positive size", () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")
        const f = window!.frame
        assert(typeof f.x === "number", "frame.x should be a number")
        assert(typeof f.y === "number", "frame.y should be a number")
        assert(typeof f.width === "number", "frame.width should be a number")
        assert(typeof f.height === "number", "frame.height should be a number")
        assert(f.width > 0, "frame.width should be > 0")
        assert(f.height > 0, "frame.height should be > 0")
    })

    it("round-trips a write", () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")
        const original = window!.frame
        try {
            const next = {
                x: original.x + 20,
                y: original.y + 20,
                width: 600,
                height: 400,
            }
            window!.frame = next
            const got = window!.frame
            const tol = 1 // AppKit may round to integer points
            assert(Math.abs(got.x - next.x) <= tol, `frame.x ${got.x} ~= ${next.x}`)
            assert(Math.abs(got.y - next.y) <= tol, `frame.y ${got.y} ~= ${next.y}`)
            assert(Math.abs(got.width - next.width) <= tol,
                `frame.width ${got.width} ~= ${next.width}`)
            assert(Math.abs(got.height - next.height) <= tol,
                `frame.height ${got.height} ~= ${next.height}`)
        } finally {
            window!.frame = original
        }
    })

    it("ignores a malformed Rect (no missing-key crash)", () => {
        const window = bike.frontmostWindow
        assert(window, "Expected a frontmost window")
        const before = window!.frame
        // Cast through any so the bad shape compiles.
        ;(window as any).frame = { x: 0, y: 0 }
        const after = window!.frame
        assert.equal(after.x, before.x, "frame.x should be unchanged")
        assert.equal(after.y, before.y, "frame.y should be unchanged")
        assert.equal(after.width, before.width, "frame.width should be unchanged")
        assert.equal(after.height, before.height, "frame.height should be unchanged")
    })
})
