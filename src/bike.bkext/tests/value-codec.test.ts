// bike.encodeValue / bike.decodeValue — the machine-facing wire codecs, one
// pure-JS implementation loaded into BOTH the app JSC context (Runtime/
// format.js) and DOM pages (common.js). The conformance describe pins the JS
// grammar to the NATIVE one through parseValue/displayValue round-trips, so
// the two implementations can't silently drift.

describe("bike.encodeValue", () => {
    it("exists in the app context", () => {
        assert(typeof bike.encodeValue === "function", "encodeValue should be a function")
        assert(typeof bike.decodeValue === "function", "decodeValue should be a function")
    })

    it("encodes a date as its LOCAL calendar day by default", () => {
        assert.equal(bike.encodeValue("date", new Date(2026, 6, 28)), "2026-07-28")
        // Late evening local time is still the LOCAL day, whatever UTC says.
        assert.equal(bike.encodeValue("date", new Date(2026, 0, 1, 23, 30)), "2026-01-01")
    })

    it("encodes a timestamp with { time: true } — the native Toggle Done stamp shape", () => {
        const wire = bike.encodeValue("date", new Date(), { time: true })!
        assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(wire), "ISO UTC, no fractional seconds: " + wire)
        assert.equal(bike.encodeValue("date", new Date(Date.UTC(2026, 6, 28, 16, 4, 12, 345)), { time: true }),
            "2026-07-28T16:04:12Z")
    })

    it("encodes durations from seconds, normalized D/H/M/S with no weeks", () => {
        assert.equal(bike.encodeValue("duration", 5400), "PT1H30M")
        assert.equal(bike.encodeValue("duration", 0), "PT0S")
        assert.equal(bike.encodeValue("duration", 86400 * 9), "P9D")
        assert.equal(bike.encodeValue("duration", 86400 + 3600 + 61), "P1DT1H1M1S")
        assert.equal(bike.encodeValue("duration", -1), undefined, "negative durations are unencodable")
    })

    it("encodes the scalar types", () => {
        assert.equal(bike.encodeValue("boolean", true), "true")
        assert.equal(bike.encodeValue("boolean", false), "false")
        assert.equal(bike.encodeValue("number", 42), "42", "integers carry no .0")
        assert.equal(bike.encodeValue("number", 1.5), "1.5")
        assert.equal(bike.encodeValue("number", NaN), undefined)
        assert.equal(bike.encodeValue("text", "  hi  "), "hi", "text trims")
        assert.equal(bike.encodeValue("choice", "orange"), "orange")
        assert.equal(bike.encodeValue("time", 9 * 3600 + 5 * 60), "09:05:00")
    })

    it("encodes intervals and recurrences", () => {
        assert.equal(
            bike.encodeValue("interval", { start: new Date(2026, 6, 1), end: new Date(2026, 6, 4) }),
            "2026-07-01/2026-07-04")
        assert.equal(
            bike.encodeValue("interval", { start: new Date(2026, 6, 4), end: new Date(2026, 6, 1) }),
            undefined, "start must not follow end")
        assert.equal(bike.encodeValue("recurrence", { interval: "P1W" }), "R/P1W")
        assert.equal(bike.encodeValue("recurrence", { count: 3, interval: "P1D" }), "R3/P1D")
        assert.equal(
            bike.encodeValue("recurrence", { interval: "P1W", weekdays: ["mon", "wed"] }),
            "R/P1W:mon,wed")
    })

    it("returns undefined for unknown types and mistyped values", () => {
        assert.equal(bike.encodeValue("nope" as any, "x" as any), undefined)
        assert.equal(bike.encodeValue("date", "2026-07-28" as any), undefined, "date wants a Date object")
    })
})

describe("bike.decodeValue", () => {
    it("decodes a day wire to LOCAL midnight with hasTime false", () => {
        const decoded = bike.decodeValue("date", "2026-07-28")!
        assert(decoded, "day form should decode")
        assert.equal(decoded.hasTime, false)
        assert.equal(decoded.date.getFullYear(), 2026)
        assert.equal(decoded.date.getMonth(), 6)
        assert.equal(decoded.date.getDate(), 28)
        assert.equal(decoded.date.getHours(), 0, "LOCAL midnight — never shifted through UTC")
    })

    it("decodes a timed wire with hasTime true", () => {
        const decoded = bike.decodeValue("date", "2026-07-28T16:04:12Z")!
        assert(decoded, "timed form should decode")
        assert.equal(decoded.hasTime, true)
        assert.equal(decoded.date.getTime(), Date.UTC(2026, 6, 28, 16, 4, 12))
    })

    it("is strict-canonical: parseValue's leniencies stay rejected", () => {
        // The exact rejection set date-marks.test.ts pins for parseDateValue.
        assert.equal(bike.decodeValue("date", ""), undefined, "valueless attribute")
        assert.equal(bike.decodeValue("date", "soon"), undefined)
        assert.equal(bike.decodeValue("date", "2026-7-1"), undefined, "unpadded is not wire")
        assert.equal(bike.decodeValue("date", "2026-07-16Tnot-a-time"), undefined)
        assert.equal(bike.decodeValue("date", "2026-13-40"), undefined, "not a real day")
    })

    it("decodes durations to seconds with the fixed calendar approximations", () => {
        // The AttributeDateTests corpus: Y=365d, M=30d, W=7d.
        assert.equal(bike.decodeValue("duration", "PT30M"), 1800)
        assert.equal(bike.decodeValue("duration", "P3D"), 3 * 86400)
        assert.equal(bike.decodeValue("duration", "P2W"), 2 * 7 * 86400)
        assert.equal(bike.decodeValue("duration", "P1Y"), 365 * 86400)
        assert.equal(bike.decodeValue("duration", "P1M"), 30 * 86400)
        assert.equal(bike.decodeValue("duration", "PT0.5S"), 0.5)
        assert.equal(bike.decodeValue("duration", "PT0S"), 0)
        assert.equal(bike.decodeValue("duration", "P"), undefined, "at least one component")
        assert.equal(bike.decodeValue("duration", "lots"), undefined)
    })

    it("decodes the scalar types", () => {
        assert.equal(bike.decodeValue("boolean", "true"), true)
        assert.equal(bike.decodeValue("boolean", "false"), false)
        assert.equal(bike.decodeValue("boolean", "yes"), undefined, "parseValue's leniency, not wire")
        assert.equal(bike.decodeValue("number", "42"), 42)
        assert.equal(bike.decodeValue("number", "x"), undefined)
        assert.equal(bike.decodeValue("time", "09:05:00"), 9 * 3600 + 5 * 60)
        assert.equal(bike.decodeValue("time", "09:05"), 9 * 3600 + 5 * 60, "HH:mm accepted in")
        assert.equal(bike.decodeValue("time", "25:00"), undefined)
    })

    it("decodes intervals and recurrences", () => {
        const interval = bike.decodeValue("interval", "2026-07-01/2026-07-04")!
        assert(interval, "interval should decode")
        assert.equal(interval.start.date.getDate(), 1)
        assert.equal(interval.end.date.getDate(), 4)
        assert.equal(bike.decodeValue("interval", "2026-07-04/2026-07-01"), undefined)
        const recurrence = bike.decodeValue("recurrence", "R3/P1W:mon,wed")!
        assert(recurrence, "recurrence should decode")
        assert.equal(recurrence.count, 3)
        assert.equal(recurrence.interval, "P1W")
        assert.equal(recurrence.weekdays.join(","), "mon,wed")
        const forever = bike.decodeValue("recurrence", "R/P1D")!
        assert.equal(forever.count, undefined)
        assert.equal(forever.weekdays.length, 0)
    })
})

describe("codec conformance with the native grammar", () => {
    // These round-trips are what license the pure-JS implementation: if the
    // JS wire grammar drifted from the native one, they break.

    it("decode reads what native parse writes", () => {
        assert.equal(bike.decodeValue("duration", bike.parseValue("duration", "90m")!.value), 5400)
        const day = bike.parseValue("date", "2030-01-02")!.value
        assert.equal(bike.decodeValue("date", day)!.date.getFullYear(), 2030)
    })

    it("native display reads what encode writes", () => {
        const wire = bike.encodeValue("duration", 5400)!
        assert.equal(wire, bike.parseValue("duration", "90m")!.value, "same wire both ways")
        assert(bike.displayValue("duration", wire).length > 0)
    })

    it("encode agrees with native parse on today's day form", () => {
        assert.equal(bike.encodeValue("date", new Date()), bike.parseValue("date", "today")!.value)
    })
})

describe("codec in the DOM context", () => {
    it("both functions work inside a panel", async () => {
        // The DOM pages load the same codec through common.js — prove it by
        // computing in the panel and posting the results back.
        const domScript = `
            var extensionExports = { activate: function(context) {
                context.postMessage({
                    type: "codec",
                    day: bike.encodeValue("date", new Date(2026, 6, 28)),
                    seconds: bike.decodeValue("duration", "PT1H30M"),
                })
            }}
        `
        const handle = await bike.showPanel({ script: domScript, frame: { x: 0, y: 0, width: 100, height: 100 } })
        const response = await new Promise<any>((resolve) => {
            handle.onmessage = (message: any) => resolve(message)
        })
        assert.equal(response.day, "2026-07-28", "DOM encodeValue")
        assert.equal(response.seconds, 5400, "DOM decodeValue")
        handle.dispose()
    })
})
