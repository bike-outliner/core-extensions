describe("calendar commands registration", () => {
    const commands = bike.commands.toString()

    it("registers calendar:today", () => {
        assert(commands.includes("calendar:today"), "calendar:today should be registered")
    })

    it("registers calendar:month", () => {
        assert(commands.includes("calendar:month"), "calendar:month should be registered")
    })

    it("registers calendar:year", () => {
        assert(commands.includes("calendar:year"), "calendar:year should be registered")
    })
})

