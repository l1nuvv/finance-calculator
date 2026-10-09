const assert = require("node:assert/strict"),
  E = require("./engine.js");
let count = 0;
const event = (id, type, date, cents, extra = {}) => ({
  id,
  name: id,
  type,
  date,
  cents,
  ...extra,
});
const budget = (events = [], balance = 10000) =>
  E.valid({ version: 1, start: "2026-10-09", balance, events });
function test(name, fn) {
  fn();
  count++;
  console.log("OK", name);
}
test("fact replaces one occurrence and preserves the following month", () => {
  const x = budget([
    event("rent", "expense", "2026-10-10", 1000, {
      repeat: "monthly",
      actuals: [{ plannedDate: "2026-10-10", date: "2026-10-11", cents: 800 }],
    }),
  ]);
  const p = E.project(x, 40);
  assert.equal(p.events.length, 2);
  assert.equal(p.final, 8200);
  assert.equal(p.events[0].date, "2026-10-11");
  assert.equal(p.events[0].plannedCents, 1000);
  assert.equal(p.events[1].cents, 1000);
});
test("fact outside the plan horizon is included on its actual date", () => {
  const p = E.project(
    budget([
      event("late", "income", "2026-09-01", 1000, {
        actuals: [
          { plannedDate: "2026-09-01", date: "2026-10-10", cents: 500 },
        ],
      }),
    ]),
    3,
  );
  assert.equal(p.final, 10500);
  assert.equal(p.events.length, 1);
});
test("earlier fact prevents double counting a later plan", () => {
  const p = E.project(
    budget([
      event("early", "expense", "2026-10-10", 1000, {
        actuals: [
          { plannedDate: "2026-10-10", date: "2026-10-08", cents: 800 },
        ],
      }),
    ]),
    3,
  );
  assert.equal(p.final, 10000);
  assert.equal(p.events.length, 0);
});
test("confirmed fact remains in conservative scenario with zero amounts supported", () => {
  const x = budget([
    event("income", "income", "2026-10-10", 1000, {
      confidence: "expected",
      actuals: [{ plannedDate: "2026-10-10", date: "2026-10-10", cents: 0 }],
    }),
  ]);
  assert.equal(E.project(x, 3, "conservative").events.length, 1);
});
test("malformed facts, duplicates and non-occurrence dates rejected", () => {
  const f = { plannedDate: "2026-10-10", date: "2026-10-11", cents: 800 };
  for (const actuals of [
    [f, f],
    [{ ...f, cents: -1 }],
    [{ ...f, plannedDate: "2026-10-12" }],
    [{ ...f, date: "2026-02-31" }],
    {},
  ])
    assert.throws(() =>
      budget([event("rent", "expense", "2026-10-10", 1000, { actuals })]),
    );
});
test("reserve includes payday obligations but excludes optional, settled and later payments", () => {
  const x = budget([
    event("salary", "income", "2026-10-20", 50000),
    event("rent", "expense", "2026-10-10", 2000),
    event("debt", "repay", "2026-10-20", 3000),
    event("optional", "expense", "2026-10-11", 9000, { required: false }),
    event("settled", "expense", "2026-10-12", 900, {
      actuals: [{ plannedDate: "2026-10-12", date: "2026-10-09", cents: 700 }],
    }),
    event("later", "expense", "2026-10-21", 9000),
  ]);
  const r = E.obligations(x, "2026-10-09");
  assert.equal(r.reserve, 5000);
  assert.equal(r.current, 9300);
  assert.equal(r.available, 4300);
  assert.deepEqual(
    r.items.map((e) => e.id),
    ["rent", "debt"],
  );
});
test("no salary uses 30 days and reports a shortfall", () => {
  const r = E.obligations(
    budget([event("rent", "expense", "2026-10-10", 1000)], 100),
    "2026-10-09",
  );
  assert.equal(r.until, "2026-11-07");
  assert.equal(r.shortfall, 900);
  assert.equal(r.available, 0);
});
test("secondary income does not prematurely stop the reserve", () => {
  const r = E.obligations(
    budget([
      event("extra", "income", "2026-10-10", 1000, { salary: false }),
      event("main", "income", "2026-10-20", 5000),
      event("rent", "expense", "2026-10-15", 1000),
    ]),
    "2026-10-09",
  );
  assert.equal(r.nextIncome.id, "main");
  assert.equal(r.reserve, 1000);
});
test("undo restores a deleted operation and preserves unrelated changes", () => {
  const old = event("old", "expense", "2026-10-10", 1000, {
    author: "original_user",
  });
  const data = budget([event("new", "income", "2026-10-11", 500)]);
  const next = E.undo(data, { event_id: "old", before: old, after: null });
  assert.equal(next.events.length, 2);
  assert.equal(next.events.find((e) => e.id === "old").author, "original_user");
  assert.equal(data.events.length, 1);
});
test("undo refuses to overwrite later changes", () => {
  const old = event("old", "expense", "2026-10-10", 1000),
    changed = { ...old, cents: 2000 };
  assert.throws(() =>
    E.undo(budget([changed]), { event_id: "old", before: null, after: old }),
  );
});
test("snapshot undo changes balance and date atomically", () => {
  const next = E.undo(budget(), {
    event_id: null,
    before: { start: "2026-10-08", balance: 500 },
    after: { start: "2026-10-09", balance: 10000 },
  });
  assert.equal(next.start, "2026-10-08");
  assert.equal(next.balance, 500);
  assert.throws(() =>
    E.undo(budget([], 10), {
      event_id: null,
      before: { start: "2026-10-08", balance: 500 },
      after: { start: "2026-10-09", balance: 10000 },
    }),
  );
});
console.log(`${count} feature tests passed`);
