const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const E = require("./engine.js"),
  S = require("./sync-core.js");
const context = {
  FinEngine: E,
  KonturSync: S,
  document: { hidden: false },
  navigator: { onLine: true },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("sync-controller.js", "utf8"), context);
const state = (events = [], balance = 0) =>
  E.valid({ version: 1, start: "2026-10-09", balance, events });
const event = (id, cents = 100) => ({
  id,
  name: id,
  cents,
  date: "2026-10-09",
  type: "expense",
});
function server(initial = state()) {
  let row = {
    id: "test-budget",
    data: initial,
    revision: 1,
    owner: true,
    members: 2,
  };
  return {
    async read() {
      return structuredClone(row);
    },
    async save(revision, data) {
      const saved = revision === row.revision;
      if (saved)
        row = { ...row, data: E.valid(data), revision: row.revision + 1 };
      return { saved, budget: structuredClone(row) };
    },
  };
}
async function controller(client) {
  const c = Object.create(context.SharedBudget.prototype),
    row = await client.read();
  let data = E.valid(row.data),
    cached;
  Object.assign(c, {
    client,
    base: data,
    revision: row.revision,
    remote: row,
    active: true,
    busy: false,
    conflicts: [],
    getData: () => data,
    onData: (value) => {
      data = E.valid(value);
    },
    cache: () => {
      cached = structuredClone({ base: c.base, local: data });
    },
    status: (message) => {
      c.message = message;
    },
    render() {},
    renderConflicts() {},
    edit: (value) => {
      data = E.valid(value);
    },
    cached: () => cached,
  });
  return c;
}
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("OK", name);
}
(async () => {
  await test("server authorship is adopted after saving imported operations", async () => {
    const db = server(), original = db.save;
    db.save = (revision, data) => original(revision, {
      ...data, events: data.events.map(item => ({ ...item, author: "test_user" }))
    });
    const c = await controller(db);
    c.edit(state([event("imported")]));
    await c.flush();
    assert.equal(c.getData().events[0].author, "test_user");
    assert.equal(c.dirty(), false);
  });
  await test("two devices converge after simultaneous additions", async () => {
    const db = server(),
      a = await controller(db),
      b = await controller(db);
    a.edit(state([event("a")]));
    b.edit(state([event("b")]));
    await Promise.all([a.flush(), b.flush()]);
    await a.flush();
    assert.deepEqual(a.getData(), b.getData());
    assert.equal(a.getData().events.length, 2);
  });
  await test("edits during a network save are sent without loss", async () => {
    const db = server(),
      c = await controller(db),
      original = db.save;
    let release, started;
    const signal = new Promise((resolve) => {
        started = resolve;
      }),
      gate = new Promise((resolve) => {
        release = resolve;
      });
    db.save = async (rev, data) => {
      started();
      await gate;
      return original(rev, data);
    };
    c.edit(state([event("a")]));
    const running = c.flush();
    await signal;
    c.edit(state([event("a"), event("b")]));
    release();
    await running;
    assert.equal((await db.read()).data.events.length, 2);
    assert.equal(c.dirty(), false);
  });
  await test("network failure keeps pending edits for retry", async () => {
    const db = server(),
      c = await controller(db),
      save = db.save;
    c.edit(state([event("offline")]));
    c.cache();
    db.save = async () => {
      throw Error("network unavailable");
    };
    await c.flush();
    assert.equal(c.dirty(), true);
    assert.equal(c.cached().local.events[0].id, "offline");
    db.save = save;
    await c.flush();
    assert.equal((await db.read()).data.events.length, 1);
  });
  await test("conflicting same event edits stop automatic save", async () => {
    const db = server(state([event("a")])),
      a = await controller(db),
      b = await controller(db);
    a.edit(state([event("a", 200)]));
    b.edit(state([event("a", 300)]));
    await a.flush();
    await b.flush();
    assert.equal(b.conflicts.length, 1);
    assert.equal((await db.read()).data.events[0].cents, 200);
    assert.equal(b.getData().events[0].cents, 300);
    await b.reconcile(b.conflictRemote, { "event:a": "local" });
    await b.flush();
    assert.equal((await db.read()).data.events[0].cents, 300);
  });
  await test("cloud deletion does not revive an unchanged event", async () => {
    const db = server(state([event("a")])),
      a = await controller(db),
      b = await controller(db);
    a.edit(state());
    await a.flush();
    await b.flush();
    assert.equal(b.getData().events.length, 0);
  });
  await test("lost membership preserves local budget without pretending success", async () => {
    const db = server(),
      c = await controller(db);
    db.read = async () => null;
    await c.flush();
    assert.match(c.message, /недоступен/);
    assert.deepEqual(c.getData(), state());
  });
  console.log(`${count} sync controller tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
