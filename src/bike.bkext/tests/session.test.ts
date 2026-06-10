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
      bike.session.observeOutlineQuery(msg.params, function (doc) {
        var n = (doc && doc.root && doc.root.children) ? doc.root.children.length : -1;
        context.postMessage({ id: msg.id, snapshot: n });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeChanges') {
      bike.session.observeOutlineChanges(msg.params, function (event) {
        context.postMessage({ id: msg.id, event: event.type });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeTree') {
      bike.session.observeOutline(msg.params, function (doc, changes) {
        var n = (doc && doc.root && doc.root.children) ? doc.root.children.length : -1;
        context.postMessage({ id: msg.id, tree: n, changes: changes.length });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeEditor') {
      bike.session.observeEditor(msg.params, function (editor) {
        context.postMessage({ id: msg.id, editor: { head: editor && editor.selection ? editor.selection.head : null, focused: editor ? editor.focused.length : 0 } });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeEditorChanges') {
      bike.session.observeEditorChanges(msg.params, function (event) {
        context.postMessage({ id: msg.id, editorEvent: event.type });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeEditorOutline') {
      bike.session.observeOutlineEditor({}, function (outline, editor, changes) {
        var ids = [];
        if (outline && outline.root) (function walk(r) { ids.push(r.id); (r.children || []).forEach(walk); })(outline.root);
        var head = editor && editor.selection ? editor.selection.head : null;
        // headInOutline encodes the invariant: a maintained selection.head is always a live row.
        context.postMessage({ id: msg.id, editor: { head: head, headInOutline: head == null || ids.indexOf(head) !== -1, ids: ids } });
      }).then(
        function (sub) { subs[msg.id] = sub; context.postMessage({ id: msg.id, value: { subscribed: true } }); },
        function (err) { context.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
      );
    } else if (msg.type === 'observeEditors') {
      bike.session.observeEditors(function (editors) {
        context.postMessage({ id: msg.id, editorsCount: editors.length });
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
    const events = new Map<number, (e: string) => void>()
    const trees = new Map<number, (m: any) => void>()
    const editorCbs = new Map<number, (e: any) => void>()
    const editorEventCbs = new Map<number, (t: string) => void>()
    const editorsCbs = new Map<number, (n: number) => void>()
    handle.onmessage = (m: any) => {
      if (typeof m.editorsCount === "number") {
        const cb = editorsCbs.get(m.id)
        if (cb) cb(m.editorsCount)
        return
      }
      if (typeof m.editorEvent === "string") {
        const cb = editorEventCbs.get(m.id)
        if (cb) cb(m.editorEvent)
        return
      }
      if (typeof m.snapshot === "number") {
        const cb = snaps.get(m.id)
        if (cb) cb(m.snapshot)
        return
      }
      if (typeof m.event === "string") {
        const cb = events.get(m.id)
        if (cb) cb(m.event)
        return
      }
      if (typeof m.tree === "number") {
        const cb = trees.get(m.id)
        if (cb) cb(m)
        return
      }
      if (m.editor !== undefined) {
        const cb = editorCbs.get(m.id)
        if (cb) cb(m.editor)
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
      observeChanges(params: any, onEvent: (e: string) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        events.set(id, onEvent)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeChanges", id, params })
        })
      },
      observeTree(params: any, onUpdate: (m: { tree: number; changes: number }) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        trees.set(id, onUpdate)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeTree", id, params })
        })
      },
      observeEditor(params: any, onSnap: (e: { head: number | null; focused: number }) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        editorCbs.set(id, onSnap)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeEditor", id, params })
        })
      },
      observeEditorChanges(params: any, onEvent: (t: string) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        editorEventCbs.set(id, onEvent)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeEditorChanges", id, params })
        })
      },
      observeEditors(onSnap: (count: number) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        editorsCbs.set(id, onSnap)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeEditors", id })
        })
      },
      observeEditorOutline(onSync: (s: { head: number | null; headInOutline: boolean; ids: number[] }) => void): Promise<{ dispose: () => void }> {
        const id = nextId++
        editorCbs.set(id, onSync as any)
        return new Promise((resolve, reject) => {
          pending.set(id, (m) => (m.error !== undefined ? reject(new Error(m.error)) : resolve({
            dispose: () => handle.postMessage({ type: "dispose", subId: id, id: nextId++ }),
          })))
          handle.postMessage({ type: "observeEditorOutline", id })
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

      const ok = await s.call("checkOutlinePath", { path: "//task @done" })
      assert(typeof ok === "string" && ok.includes("-- Parse Tree --"), "valid path parses to a tree report")
      const bad = await s.call("checkOutlinePath", { path: "//task @done = 'x'" })
      assert(typeof bad === "string" && bad.includes("-- Parse Error --"), "invalid path reports the parse error")
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

  it("observeOutlineQuery streams a snapshot after an edit, then disposes", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      let resolveSnap: (n: number) => void
      const firstSnap = new Promise<number>((res) => { resolveSnap = res })
      const sub = await s.observe({ path: "//*", shape: "flat" }, (n) => resolveSnap(n))

      // Trigger a change so a snapshot is emitted (debounced ~500ms).
      await s.call("createRow", { markdown: "observed row" })

      const rows = await withTimeout(firstSnap, 5000, "observeOutlineQuery snapshot")
      assert(rows >= 1, "snapshot reports at least one row")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeOutlineChanges seeds with a snapshot, then streams granular changes", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      // The seed arrives asynchronously after subscribe resolves, so wait for
      // the first event rather than reading it synchronously.
      const seen: string[] = []
      let resolveSeed: (t: string) => void
      const seed = new Promise<string>((res) => { resolveSeed = res })
      let resolveChange: (t: string) => void
      const firstChange = new Promise<string>((res) => { resolveChange = res })
      const sub = await s.observeChanges({}, (type) => {
        seen.push(type)
        if (seen.length === 1) resolveSeed(type)
        else if (type !== "snapshot") resolveChange(type)
      })
      const seedType = await withTimeout(seed, 5000, "snapshot seed")
      assert.equal(seedType, "snapshot", "first event is a full-outline snapshot seed")

      await s.call("createRow", { markdown: "inserted row" })
      const changeType = await withTimeout(firstChange, 5000, "granular change after edit")
      assert.equal(changeType, "rowsInserted", "creating a row streams a rowsInserted change")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeOutline maintains a tree that reflects edits", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      // The seed update arrives asynchronously after subscribe resolves.
      let count = 0
      let resolveSeed: (m: { tree: number; changes: number }) => void
      const seed = new Promise<{ tree: number; changes: number }>((res) => { resolveSeed = res })
      let resolveGrew: (m: { tree: number; changes: number }) => void
      const grew = new Promise<{ tree: number; changes: number }>((res) => { resolveGrew = res })
      const sub = await s.observeTree({}, (m) => {
        count += 1
        if (count === 1) resolveSeed(m)
        if (m.changes > 0 && m.tree >= 1) resolveGrew(m)
      })
      // Seed update: maintained doc starts empty, with no applied changes.
      const seedUpdate = await withTimeout(seed, 5000, "maintained tree seed")
      assert(seedUpdate.tree === 0 && seedUpdate.changes === 0, "seed delivers the empty tree with no changes")

      await s.call("createRow", { markdown: "maintained row" })
      const m = await withTimeout(grew, 5000, "maintained tree grows after edit")
      assert(m.tree >= 1, "maintained tree reflects the new row")
      assert(m.changes >= 1, "the applied change is delivered alongside the tree")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeOutline with debounce coalesces edits into one batched update", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      let count = 0
      let resolveSeed: () => void
      const seed = new Promise<void>((res) => { resolveSeed = res })
      let resolveBatch: (m: { tree: number; changes: number }) => void
      const batched = new Promise<{ tree: number; changes: number }>((res) => { resolveBatch = res })
      // 400ms quiet window: two quick edits land in the same batch.
      const sub = await s.observeTree({ debounce: 400 }, (m) => {
        count += 1
        if (count === 1) resolveSeed()
        else if (m.changes >= 2) resolveBatch(m)
      })
      await withTimeout(seed, 5000, "debounced seed")

      // Two separate transactions inside the window → one coalesced onUpdate.
      await s.call("createRow", { markdown: "one" })
      await s.call("createRow", { markdown: "two" })
      const m = await withTimeout(batched, 5000, "coalesced batch")
      assert.equal(m.changes, 2, "both edits arrive in a single batched onUpdate")
      assert(m.tree >= 2, "maintained tree reflects both new rows")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeEditor streams an editor snapshot reflecting selection changes", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const a = await s.call("createRow", { markdown: "alpha" })
      await s.call("createRow", { markdown: "beta" })

      // debounce 0 for a live snapshot; wait for one reporting row `a` selected.
      let resolveSel: (head: number) => void
      const selectedA = new Promise<number>((res) => { resolveSel = res })
      const sub = await s.observeEditor({ debounce: 0 }, (e) => {
        if (e && e.head === a.id) resolveSel(a.id)
      })

      await s.call("updateEditor", { select: a.id })
      const head = await withTimeout(selectedA, 5000, "editor selection snapshot")
      assert.equal(head, a.id, "editor snapshot reflects the new selection")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeEditorChanges seeds with a snapshot, then streams slice changes", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const a = await s.call("createRow", { markdown: "alpha" })

      const seen: string[] = []
      let resolveSeed: (t: string) => void
      const seed = new Promise<string>((res) => { resolveSeed = res })
      let resolveFocus: (t: string) => void
      const focusChange = new Promise<string>((res) => { resolveFocus = res })
      const sub = await s.observeEditorChanges({ debounce: 0 }, (type) => {
        seen.push(type)
        if (seen.length === 1) resolveSeed(type)
        else if (type === "focus") resolveFocus(type)
      })
      const seedType = await withTimeout(seed, 5000, "editor snapshot seed")
      assert.equal(seedType, "snapshot", "first event is a full-editor snapshot seed")

      // Focusing a row always moves the focus stack off the root → a slice change.
      await s.call("updateEditor", { focus: a.id })
      const changeType = await withTimeout(focusChange, 5000, "editor focus change")
      assert.equal(changeType, "focus", "focusing a row streams a focus slice change")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeOutlineEditor keeps selection valid against the synced outline", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      const a = await s.call("createRow", { markdown: "alpha" })
      await s.call("createRow", { markdown: "beta" })
      await s.call("updateEditor", { select: a.id })

      let resolveGone: (sync: { head: number | null; headInOutline: boolean; ids: number[] }) => void
      const aGone = new Promise<{ head: number | null; headInOutline: boolean; ids: number[] }>((res) => { resolveGone = res })
      const sub = await s.observeEditorOutline((sync) => {
        // Resolve once the deleted row is gone from the maintained outline.
        if (sync.ids.indexOf(a.id) === -1) resolveGone(sync)
      })

      // Deleting the selected row removes it from the outline AND moves the
      // selection — both arrive in one batch, outline applied first.
      await s.call("deleteRows", { rows: [a.id] })
      const sync = await withTimeout(aGone, 5000, "row removed from synced outline")
      assert(sync.ids.indexOf(a.id) === -1, "deleted row is gone from the maintained outline")
      assert(sync.headInOutline, "selection.head is still a live row in the synced outline (delivered together)")
      sub.dispose()
    } finally { s.dispose() }
  })

  it("observeEditors seeds the open-editor list and re-emits as outlines open and close", async () => {
    bike.testEditor()
    const s = await openSession()
    try {
      let latest = -1
      let waiter: { pred: (n: number) => boolean; resolve: () => void } | null = null
      const sub = await s.observeEditors((count) => {
        latest = count
        if (waiter && waiter.pred(count)) { waiter.resolve(); waiter = null }
      })
      const waitFor = (pred: (n: number) => boolean, label: string) =>
        pred(latest) ? Promise.resolve()
          : withTimeout(new Promise<void>((resolve) => { waiter = { pred, resolve } }), 5000, label)

      await waitFor((n) => n >= 1, "seed lists at least the test editor")
      const base = latest

      // Opening a new outline adds an editor; closing it removes one.
      const created = await s.call("newOutline", {})
      await waitFor((n) => n > base, "editor added after newOutline")
      await s.call("closeOutline", { outline: created.persistentId, discard: true })
      await waitFor((n) => n <= base, "editor removed after closeOutline")

      sub.dispose()
    } finally { s.dispose() }
  })
})
