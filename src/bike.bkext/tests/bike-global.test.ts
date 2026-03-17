describe("bike global", () => {
    it("has version string", () => {
        assert(typeof bike.version === "string", "version should be a string")
        assert(bike.version.length > 0, "version should not be empty")
    })

    it("has build number", () => {
        assert(typeof bike.build === "number", "build should be a number")
        assert(bike.build > 0, "build should be positive")
    })

    it("has apiVersion string", () => {
        assert(typeof bike.apiVersion === "string", "apiVersion should be a string")
        assert(bike.apiVersion.length > 0, "apiVersion should not be empty")
    })

    it("has commands interface", () => {
        assert(bike.commands, "commands should exist")
        assert(typeof bike.commands.toString === "function", "commands.toString should be a function")
        assert(typeof bike.commands.addCommands === "function", "commands.addCommands should be a function")
        assert(typeof bike.commands.performCommand === "function", "commands.performCommand should be a function")
    })

    it("has keybindings interface", () => {
        assert(bike.keybindings, "keybindings should exist")
        assert(typeof bike.keybindings.toString === "function", "keybindings.toString should be a function")
        assert(typeof bike.keybindings.addKeybindings === "function", "keybindings.addKeybindings should be a function")
    })

    it("has clipboard interface", () => {
        assert(bike.clipboard, "clipboard should exist")
        assert(typeof bike.clipboard.readText === "function", "readText should be a function")
        assert(typeof bike.clipboard.writeText === "function", "writeText should be a function")
    })

    it("has observer functions", () => {
        assert(typeof bike.observeWindows === "function", "observeWindows should be a function")
        assert(typeof bike.observeFrontmostWindow === "function", "observeFrontmostWindow should be a function")
        assert(typeof bike.observeDocuments === "function", "observeDocuments should be a function")
        assert(typeof bike.observeFrontmostDocument === "function", "observeFrontmostDocument should be a function")
        assert(typeof bike.observeFrontmostOutlineEditor === "function", "observeFrontmostOutlineEditor should be a function")
    })

    it("has showAlert function", () => {
        assert(typeof bike.showAlert === "function", "showAlert should be a function")
    })

    it("has showChoiceBox function", () => {
        assert(typeof bike.showChoiceBox === "function", "showChoiceBox should be a function")
    })

    it("has testEditor function", () => {
        assert(typeof bike.testEditor === "function", "testEditor should be a function")
    })

    it("has testOutline function", () => {
        assert(typeof bike.testOutline === "function", "testOutline should be a function")
    })
})

describe("bike window", () => {
    const editor = bike.testEditor()
    const window = bike.frontmostWindow!

    it("has title", () => {
        assert(typeof window.title === "string", "title should be a string")
    })

    it("has sidebar", () => {
        assert(window.sidebar, "sidebar should exist")
        assert(typeof window.sidebar.addLocation === "function", "addLocation should be a function")
    })

    it("has inspector", () => {
        assert(window.inspector, "inspector should exist")
        assert(typeof window.inspector.addItem === "function", "addItem should be a function")
    })

    it("has documents array", () => {
        assert(Array.isArray(window.documents), "documents should be an array")
        assert(window.documents.length > 0, "should have at least one document")
    })

    it("has outlineEditors array", () => {
        assert(Array.isArray(window.outlineEditors), "outlineEditors should be an array")
    })

    it("has currentOutlineEditor", () => {
        assert(window.currentOutlineEditor, "currentOutlineEditor should exist")
    })

    it("has observeCurrentOutlineEditor", () => {
        assert(typeof window.observeCurrentOutlineEditor === "function")
    })
})

describe("bike document", () => {
    const editor = bike.testEditor()
    const doc = bike.frontmostDocument!

    it("has displayName", () => {
        assert(typeof doc.displayName === "string")
    })

    it("has fileType", () => {
        assert(typeof doc.fileType === "string")
    })

    it("has outline", () => {
        assert(doc.outline, "document should have an outline")
        assert(doc.outline.root, "outline should have a root")
    })

    it("has windows array", () => {
        assert(Array.isArray(doc.windows), "windows should be an array")
    })
})
