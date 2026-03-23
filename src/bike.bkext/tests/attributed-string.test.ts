import { AttributedString } from 'bike/app'

describe("AttributedString basics", () => {
    const outline = bike.testOutline()

    outline.insertRows(["Hello World"], outline.root)

    it("has string property", () => {
        const text = outline.root.firstChild!.text
        assert.equal(text.string, "Hello World")
    })

    it("has count property", () => {
        const text = outline.root.firstChild!.text
        assert.equal(text.count, 11)
    })

    it("can set string", () => {
        const row = outline.root.firstChild!
        row.text.string = "Changed"
        assert.equal(row.text.string, "Changed")
        row.text.string = "Hello World"
    })
})

describe("AttributedString insert/replace/append/delete", () => {
    const outline = bike.testOutline()

    outline.insertRows(["Hello World"], outline.root)

    it("can insert text", () => {
        const row = outline.root.firstChild!
        row.text.insert(5, " Beautiful")
        assert.equal(row.text.string, "Hello Beautiful World")
        row.text.string = "Hello World"
    })

    it("can replace text range", () => {
        const row = outline.root.firstChild!
        row.text.replace([0, 5], "Goodbye")
        assert.equal(row.text.string, "Goodbye World")
        row.text.string = "Hello World"
    })

    it("can append text", () => {
        const row = outline.root.firstChild!
        row.text.append("!!!")
        assert.equal(row.text.string, "Hello World!!!")
        row.text.string = "Hello World"
    })

    it("can delete text range", () => {
        const row = outline.root.firstChild!
        row.text.delete([5, 11])
        assert.equal(row.text.string, "Hello")
        row.text.string = "Hello World"
    })
})

describe("AttributedString substring", () => {
    const outline = bike.testOutline()

    outline.insertRows(["Hello World"], outline.root)

    it("returns substring", () => {
        const text = outline.root.firstChild!.text
        const sub = text.substring([0, 5])
        assert.equal(sub.string, "Hello")
        assert.equal(sub.count, 5)
    })
})

describe("AttributedString text attributes", () => {
    const outline = bike.testOutline()

    outline.insertRows(["Hello World"], outline.root)

    it("can add and read strong attribute", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("strong", "", [0, 5])
        const value = row.text.attributeAt("strong", 0)
        assert.equal(value, "")
        const noValue = row.text.attributeAt("strong", 6)
        assert.equal(noValue, undefined)
        row.text.removeAttribute("strong", [0, 5])
    })

    it("can add and read em attribute", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("em", "", [6, 11])
        assert.equal(row.text.attributeAt("em", 7), "")
        assert.equal(row.text.attributeAt("em", 0), undefined)
        row.text.removeAttribute("em", [6, 11])
    })

    it("can add link attribute", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("a", "https://example.com", [0, 5])
        assert.equal(row.text.attributeAt("a", 2), "https://example.com")
        row.text.removeAttribute("a", [0, 5])
    })

    it("can add multiple attributes with addAttributes", () => {
        const row = outline.root.firstChild!
        row.text.addAttributes({ strong: "", em: "" }, [0, 5])
        assert.equal(row.text.attributeAt("strong", 2), "")
        assert.equal(row.text.attributeAt("em", 2), "")
        outline.transaction({ label: "test" }, () => {
            row.text.removeAttribute("strong", [0, 5])
            row.text.removeAttribute("em", [0, 5])
        })
    })

    it("can get attributes at index", () => {
        const row = outline.root.firstChild!
        outline.transaction({ label: "test" }, () => {
            row.text.addAttribute("strong", "", [0, 5])
            row.text.addAttribute("code", "", [0, 5])
        })
        const attrs = row.text.attributesAt(2)
        assert.equal(attrs["strong"], "")
        assert.equal(attrs["code"], "")
        outline.transaction({ label: "test" }, () => {
            row.text.removeAttribute("strong", [0, 5])
            row.text.removeAttribute("code", [0, 5])
        })
    })

    it("attributeAt returns effective range", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("strong", "", [2, 7])
        const range: [number, number] = [0, 0]
        row.text.attributeAt("strong", 3, "upstream", range)
        assert.equal(range[0], 2)
        assert.equal(range[1], 7)
        row.text.removeAttribute("strong", [2, 7])
    })

    it("can remove attribute", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("mark", "", [0, 5])
        assert.equal(row.text.attributeAt("mark", 2), "")
        row.text.removeAttribute("mark", [0, 5])
        assert.equal(row.text.attributeAt("mark", 2), undefined)
    })
})

describe("AttributedString export", () => {
    const outline = bike.testOutline()

    outline.insertRows(["Hello World"], outline.root)

    it("toMarkdown returns string", () => {
        const text = outline.root.firstChild!.text
        const md = text.toMarkdown()
        assert(typeof md === "string", "toMarkdown should return a string")
    })

    it("toHTML returns string", () => {
        const text = outline.root.firstChild!.text
        const html = text.toHTML()
        assert(typeof html === "string", "toHTML should return a string")
    })

    it("toMarkdown preserves formatting", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("strong", "", [0, 5])
        const md = row.text.toMarkdown()
        assert(md.includes("**"), "markdown should contain bold markers")
        row.text.removeAttribute("strong", [0, 5])
    })
})

describe("AttributedString factory methods", () => {
    const outline = bike.testOutline()
    outline.insertRows(["Hello World"], outline.root)

    it("fromMarkdown creates attributed string", () => {
        const text = AttributedString.fromMarkdown("hello **bold** world")
        assert.equal(text.string, "hello bold world")
        assert.equal(text.attributeAt("strong", 6), "")
        assert.equal(text.attributeAt("strong", 0), undefined)
    })

    it("fromMarkdown handles emphasis", () => {
        const text = AttributedString.fromMarkdown("*italic* text")
        assert.equal(text.string, "italic text")
        assert.equal(text.attributeAt("em", 0), "")
    })

    it("fromMarkdown handles links", () => {
        const text = AttributedString.fromMarkdown("[link](https://example.com)")
        assert.equal(text.string, "link")
        assert.equal(text.attributeAt("a", 0), "https://example.com")
    })

    it("fromMarkdown handles plain text", () => {
        const text = AttributedString.fromMarkdown("plain text")
        assert.equal(text.string, "plain text")
    })

    it("fromHTML creates attributed string", () => {
        const text = AttributedString.fromHTML("<p><strong>bold</strong> text</p>")
        assert.equal(text.string, "bold text")
        assert.equal(text.attributeAt("strong", 0), "")
    })

    it("fromHTML handles emphasis", () => {
        const text = AttributedString.fromHTML("<p><em>italic</em> text</p>")
        assert.equal(text.string, "italic text")
        assert.equal(text.attributeAt("em", 0), "")
    })

    it("fromHTML handles links", () => {
        const text = AttributedString.fromHTML('<p><a href="https://example.com">link</a></p>')
        assert.equal(text.string, "link")
        assert.equal(text.attributeAt("a", 0), "https://example.com")
    })

    it("roundtrip markdown", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("strong", "", [0, 5])
        const md = row.text.toMarkdown()
        const roundtripped = AttributedString.fromMarkdown(md)
        assert.equal(roundtripped.string, row.text.string)
        assert.equal(roundtripped.attributeAt("strong", 0), "")
        row.text.removeAttribute("strong", [0, 5])
    })

    it("roundtrip HTML", () => {
        const row = outline.root.firstChild!
        row.text.addAttribute("em", "", [6, 11])
        const html = row.text.toHTML()
        const roundtripped = AttributedString.fromHTML(html)
        assert.equal(roundtripped.string, row.text.string)
        assert.equal(roundtripped.attributeAt("em", 6), "")
        row.text.removeAttribute("em", [6, 11])
    })

    it("fromMarkdown result can be used with insert", () => {
        const row = outline.root.firstChild!
        const bold = AttributedString.fromMarkdown("**bold**")
        row.text.insert(5, bold)
        assert.equal(row.text.string, "Hellobold World")
        assert.equal(row.text.attributeAt("strong", 5), "")
        row.text.string = "Hello World"
    })

    it("fromMarkdown throws on multiple paragraphs", () => {
        assert.throws(() => {
            AttributedString.fromMarkdown("para1\n\npara2")
        })
    })

    it("fromHTML throws on invalid HTML", () => {
        assert.throws(() => {
            AttributedString.fromHTML("not valid < xml")
        })
    })

    it("fromHTML throws on multiple paragraphs", () => {
        assert.throws(() => {
            AttributedString.fromHTML("<p>one</p><p>two</p>")
        })
    })
})