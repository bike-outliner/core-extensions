// Tests for the DOM-only `bike.session` API. They run in the app context, so
// each test presents a sheet whose inline DOM script drives `bike.session.*`
// and relays results back over postMessage (the only way to reach the API).
//
// `bike.testEditor()` opens a single real, frontmost, empty test document; the
// test runner closes any other documents first, so session calls without an
// `outline`/`editor` resolve to that test document.

const SESSION_RPC = `
var extensionExports = { activate: function (context) {
  var subs = {};
  context.onmessage = function (msg) {
    if (msg.type === 'call') {
      try {
        Promise.resolve(bike.session[msg.method](msg.params)).then(
          function (value) { context.postMessage({ id: msg.id, value: value }); },
          function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
        );
      } catch (e) { context.postMessage({ id: msg.id, error: String((e && e.message) || e) }); }
    } else if (msg.type === 'observe') {
      bike.session.observeOutline(msg.params, function (doc) {
        var n = (doc && doc.root && doc.root.children) ? doc.root.children.length : -1;
        context.postMessage({ id: msg.id, snapshot: n });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'dispose') {
      if (subs[msg.subId]) { subs[msg.subId].dispose(); }
    }
  };
}}
`

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout: " + label)), ms)),
  ])
}

describe("bike.session DOM API", () => {

  // Present a sheet running SESSION_RPC and return a small client over it.
  async function openSession() {
    const window = bike.frontmostWindow
    assert(window, "Expected a frontmost window")
    const handle = await window!.presentSheet(SESSION_RPC, { width: 100, height: 100 })
    assert(handle, "Expected a DOMScriptHandle")

    const pending = new Map<number, (m: any) => void>()
    const snaps = new Map<number, (n: number) => void>()
    handle.onmessage = (m: any) => {
      if (typeof m.snapshot === "number") {
        const cb = snaps.get(m.id)
        if (cb) cb(m.snapshot)
        return
      }
      const resolve = pending.get(m.id)
      if (resolve) { pending.delete(m.id); resolve(m) }
    }

    let nextId = 1
    function send(payload: any): Promise<any> {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve(m.value)))
        handle.postMessage({ ...payload, id })
      })
    }

    return {
      dispose: () => handle.dispose(),
      call: (method: string, params?: any) => send({ type: "call", method, params }),
      observe(params: any, onSnap: (n: number) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        snaps.set(id, onSnap)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observe", id, params })
        })
      },
    }
  }

  it("reads outlines, editors, commands, and editor state", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const outlines = await s.call("getOutlines")
      assert(Array.isArray(outlines) && outlines.length >= 1, "getOutlines returns the open outline(s)")
      assert.equal(typeof outlines[0].persistentId, "string", "OutlineSummary.persistentId")
      assert(!("frontmost" in outlines[0]), "OutlineSummary has no frontmost field")

      const editors = await s.call("getEditors")
      assert(Array.isArray(editors) && editors.length >= 1, "getEditors")
      assert.equal(typeof editors[0].id, "string", "EditorSummary.id")
      assert.equal(typeof editors[0].outlineId, "string", "EditorSummary.outlineId")

      const commands = await s.call("getCommands")
      assert(commands.length > 0, "getCommands non-empty")
      assert.equal(typeof commands[0].id, "string", "CommandInfo.id")
      assert("source" in commands[0], "CommandInfo.source")

      const ed = await s.call("getEditor")
      assert.equal(typeof ed.id, "string", "SessionEditor.id")
      assert.equal(typeof ed.outlineId, "string", "SessionEditor.outlineId")
      assert(Array.isArray(ed.focused) && Array.isArray(ed.collapsed), "focused/collapsed arrays")
      assert("filter" in ed, "SessionEditor.filter present")
    } finally { s.dispose() }
  })

  it("returns a full session document with a typed root", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const doc = await s.call("getOutline")
      assert.equal(typeof doc.persistentId, "string", "SessionOutline.persistentId always present")
      assert.equal(typeof doc.displayName, "string", "displayName present")
      assert("metadata" in doc, "metadata present")
      assert(doc.root, "has root")
      assert.equal(doc.root.type, "body", "root carries a type")
      assert.equal(JSON.stringify(doc.root.text), "[]", "root text is empty")
      assert(Array.isArray(doc.root.children), "root children is an array")
    } finally { s.dispose() }
  })

  it("creates/updates/deletes rows; numeric RowRef and position work", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const row = await s.call("createRow", { markdown: "Hello session" })
      assert.equal(typeof row.id, "number", "createRow returns a numeric SessionId")
      assert.equal(row.type, "body", "default row type")
      assert.equal(row.text[0].string, "Hello session", "row text")

      // numeric RowRef (a session id, a number) resolves the row
      const got = await s.call("getOutline", { rowRefs: [row.id], shape: "flat" })
      const ids = got.root.children.map((c: any) => c.id)
      assert(ids.indexOf(row.id) !== -1, "numeric RowRef resolves the row")

      // numeric position
      const first = await s.call("createRow", { markdown: "First", position: 0 })
      assert.equal(typeof first.id, "number", "createRow accepts a numeric position")

      // update by numeric id — updateRows returns [{ row, fieldErrors? }]
      const updated = await s.call("updateRows", { rows: [row.id], type: "heading" })
      assert.equal(updated[0].row.type, "heading", "updateRows changed type")
      assert(!updated[0].fieldErrors, "no field errors")

      const del = await s.call("deleteRows", { rows: [row.id, first.id] })
      assert(del.deleted >= 2, "deleteRows reports a count")
    } finally { s.dispose() }
  })

  it("updateEditor filter round-trips through getEditor.filter", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      await s.call("updateEditor", { filter: "//heading" })
      let ed = await s.call("getEditor")
      assert.equal(ed.filter, "//heading", "filter set")

      await s.call("updateEditor", { filter: "" })
      ed = await s.call("getEditor")
      assert.equal(ed.filter, null, "empty filter clears to null")
    } finally { s.dispose() }
  })

  it("evaluateScript returns JSON", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const obj = await s.call("evaluateScript", { script: "({ a: 1, b: [2, 3] })" })
      assert.equal(obj.a, 1, "object result")
      assert.equal(JSON.stringify(obj.b), "[2,3]", "nested array")

      const prim = await s.call("evaluateScript", { script: "1 + 1" })
      assert.equal(prim, "2", "primitive returns as a string")
    } finally { s.dispose() }
  })

  it("observeOutline streams a snapshot after an edit, then disposes", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      let resolveSnap: (n: number) => void
      const firstSnap = new Promise<number>((res) => { resolveSnap = res })
      const sub = await s.observe({ path: "//*", shape: "flat" }, (n) => resolveSnap(n))

      // Trigger a change so a snapshot is emitted (debounced ~500ms).
      await s.call("createRow", { markdown: "observed row" })

      const rows = await withTimeout(firstSnap, 5000, "observeOutline snapshot")
      assert(rows >= 1, "snapshot reports at least one row")
      sub.dispose()
    } finally { s.dispose() }
  })
})
