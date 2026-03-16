describe("Commands", () => {
    it("has addCommands function", () => {
        assert(typeof bike.commands.addCommands === "function")
    })

    it("has performCommand function", () => {
        assert(typeof bike.commands.performCommand === "function")
    })

    it("has toString function", () => {
        assert(typeof bike.commands.toString === "function")
        const str = bike.commands.toString()
        assert(typeof str === "string")
        assert(str.length > 0, "toString should return non-empty string")
    })

    it("can add and remove commands", () => {
        const disposable = bike.commands.addCommands({
            commands: {
                "test:my-test-command": () => true,
            },
        })
        assert(disposable, "addCommands should return a disposable")
        const commands = bike.commands.toString()
        assert(commands.includes("test:my-test-command"), "should contain added command")
        disposable.dispose()
        const commandsAfter = bike.commands.toString()
        assert(!commandsAfter.includes("test:my-test-command"), "should not contain removed command")
    })

    it("performCommand returns true for handled command", () => {
        const disposable = bike.commands.addCommands({
            commands: {
                "test:returns-true": () => true,
            },
        })
        const result = bike.commands.performCommand("test:returns-true")
        assert.equal(result, true)
        disposable.dispose()
    })

    it("performCommand returns false for unhandled command", () => {
        const disposable = bike.commands.addCommands({
            commands: {
                "test:returns-false": () => false,
            },
        })
        const result = bike.commands.performCommand("test:returns-false")
        assert.equal(result, false)
        disposable.dispose()
    })

    it("performCommand returns undefined for missing command", () => {
        const result = bike.commands.performCommand("test:nonexistent-command-xyz")
        assert.equal(result, undefined)
    })

    it("has core bike commands registered", () => {
        const commands = bike.commands.toString()
        assert(commands.includes("bike:.click-handle"), "should have click-handle")
        assert(commands.includes("bike:.click-link"), "should have click-link")
        assert(commands.includes("bike:.click-focus"), "should have click-focus")
    })
})

describe("Keybindings", () => {
    it("has addKeybindings function", () => {
        assert(typeof bike.keybindings.addKeybindings === "function")
    })

    it("has toString function", () => {
        const str = bike.keybindings.toString()
        assert(typeof str === "string")
        assert(str.length > 0)
    })

    it("has modifier state properties", () => {
        assert(typeof bike.keybindings.isCommandPressed === "boolean")
        assert(typeof bike.keybindings.isControlPressed === "boolean")
        assert(typeof bike.keybindings.isOptionPressed === "boolean")
        assert(typeof bike.keybindings.isShiftPressed === "boolean")
    })

    it("has activeModifiers array", () => {
        assert(Array.isArray(bike.keybindings.activeModifiers))
    })

    it("can add and remove keybindings", () => {
        const disposable = bike.keybindings.addKeybindings({
            keymap: "text-mode",
            keybindings: {
                "ctrl-shift-t": "test:my-test-command",
            },
        })
        assert(disposable, "addKeybindings should return a disposable")
        const bindings = bike.keybindings.toString()
        assert(bindings.includes("test:my-test-command"), "should contain added keybinding")
        disposable.dispose()
    })

    it("can add keybindings with priority", () => {
        const disposable = bike.keybindings.addKeybindings({
            keymap: "block-mode",
            keybindings: {
                "ctrl-shift-p": "test:priority-command",
            },
            priority: 100,
        })
        assert(disposable, "should return a disposable")
        disposable.dispose()
    })
})
