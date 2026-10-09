const assert = require("node:assert/strict"),
  E = require("./engine.js"),
  S = require("./sync-core.js");
const event = (id, cents = 100) =>
  E.valid({
    version: 1,
    start: "2026-10-09",
    balance: 0,
    events: [{ id, name: id, date: "2026-10-09", cents, type: "expense" }],
  }).events[0];
const state = (events = [], balance = 0, start = "2026-10-09") =>
  E.valid({ version: 1, start, balance, events });
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("OK", name);
}
test("disjoint additions survive concurrent save", () => {
  const result = S.merge(state(), state([event("a")]), state([event("b")]));
  assert.deepEqual(
    result.data.events.map((e) => e.id),
    ["a", "b"],
  );
  assert.equal(result.conflicts.length, 0);
});
test("delete and unrelated edit merge", () => {
  const result = S.merge(
    state([event("a"), event("b")]),
    state([event("b")]),
    state([event("a"), event("b", 200)]),
  );
  assert.deepEqual(result.data.events, [event("b", 200)]);
  assert.equal(result.conflicts.length, 0);
});
test("same edit on both devices is not a conflict", () => {
  assert.equal(
    S.merge(
      state([event("a")]),
      state([event("a", 200)]),
      state([event("a", 200)]),
    ).conflicts.length,
    0,
  );
});
test("edit versus deletion needs a choice", () => {
  const b = state([event("a")]),
    l = state([event("a", 200)]),
    r = state();
  assert.equal(S.merge(b, l, r).conflicts[0].key, "event:a");
  assert.equal(S.merge(b, l, r, { "event:a": "remote" }).data.events.length, 0);
  assert.equal(
    S.merge(b, l, r, { "event:a": "local" }).data.events[0].cents,
    200,
  );
});
test("competing balance and date remain an atomic snapshot", () => {
  const result = S.merge(state(), state([], 100), state([], 0, "2026-10-10"));
  assert.equal(result.conflicts[0].key, "snapshot");
  const resolved = S.merge(
    state(),
    state([], 100),
    state([], 0, "2026-10-10"),
    { snapshot: "remote" },
  );
  assert.equal(resolved.data.balance, 0);
  assert.equal(resolved.data.start, "2026-10-10");
});
test("merge never mutates inputs", () => {
  const base = state([event("a")]),
    before = JSON.stringify(base);
  S.merge(base, state(), state());
  assert.equal(JSON.stringify(base), before);
});
test("malicious imported value cannot enter merge", () => {
  assert.throws(() =>
    S.merge(state(), state(), { ...state(), events: [null] }),
  );
});
console.log(`${count} sync merge tests passed`);
