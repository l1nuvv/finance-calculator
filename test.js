const assert = require("node:assert/strict"),
  E = require("./engine.js");
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("OK", name);
}
const s = (balance = 0, events = [], start = "2026-10-09") => ({
  version: 1,
  start,
  balance,
  events,
});
const e = (id, date, cents, type = "expense", extra = {}) => ({
  id,
  name: id,
  date,
  cents,
  type,
  repeat: "once",
  confidence: "confirmed",
  ...extra,
});
test("money exact decimals", () => {
  assert.equal(E.money("10,05"), 1005);
  assert.equal(E.money("-0.02"), -2);
  assert.throws(() => E.money("0.001"));
  assert.throws(() => E.money("NaN"));
});
test("basic balance", () => {
  const p = E.project(s(10000, [e("x", "2026-10-09", 2000)]), 2);
  assert.equal(p.final, 8000);
  assert.equal(p.min, 8000);
});
test("multiple operations", () => {
  const p = E.project(
    s(0, [
      e("x", "2026-10-09", 200, "income"),
      e("y", "2026-10-09", 300, "income"),
      e("z", "2026-10-09", 100),
    ]),
    1,
  );
  assert.equal(p.final, 400);
});
test("deficit before salary", () => {
  const p = E.project(
    s(100000, [
      e("rent", "2026-10-10", 2000000),
      e("salary", "2026-10-15", 3000000, "income"),
    ]),
    12,
  );
  assert.equal(p.firstNegative, "2026-10-10");
  assert.equal(p.needed, 1900000);
  assert.equal(p.final, 1100000);
});
test("borrow and repay", () => {
  const p = E.project(
    s(0, [
      e("borrow", "2026-10-09", 200000, "borrow"),
      e("repay", "2026-10-10", 100000, "repay"),
    ]),
    2,
  );
  assert.equal(p.final, 100000);
});
test("monthly anchored 31 leap year", () => {
  const dates = E.occurrences(
    e("rent", "2024-01-31", 100, "expense", { repeat: "monthly" }),
    "2024-01-01",
    "2024-04-01",
  );
  assert.deepEqual(dates, ["2024-01-31", "2024-02-29", "2024-03-31"]);
});
test("monthly anchored 30 normal year", () => {
  const dates = E.occurrences(
    e("r", "2025-01-30", 100, "expense", { repeat: "monthly" }),
    "2025-01-01",
    "2025-04-01",
  );
  assert.deepEqual(dates, ["2025-01-30", "2025-02-28", "2025-03-30"]);
});
test("twice monthly", () => {
  const x = e("salary", "2026-10-10", 5000, "income", {
    repeat: "twice",
    days: [10, 25],
  });
  assert.deepEqual(E.occurrences(x, "2026-10-09", "2026-11-11"), [
    "2026-10-10",
    "2026-10-25",
    "2026-11-10",
  ]);
});
test("expected excluded from conservative", () => {
  const x = e("bonus", "2026-10-09", 5000, "income", {
    confidence: "expected",
  });
  assert.equal(E.project(s(0, [x]), 1).final, 5000);
  assert.equal(E.project(s(0, [x]), 1, "conservative").final, 0);
});
test("scenario does not mutate", () => {
  const data = s(0, [e("rent", "2026-10-09", 100)]);
  assert.equal(
    E.project(data, 1, "base", [e("loan", "2026-10-09", 200, "borrow")]).final,
    100,
  );
  assert.equal(E.project(data, 1).final, -100);
});
test("zero interest loan", () => {
  const x = E.loan(120000, 0, 12);
  assert.equal(x.interest, 0);
  assert.equal(x.total, 120000);
  assert.equal(x.remaining, 0);
});
test("annuity crosscheck", () => {
  const x = E.loan(10000000, 1200, 12);
  assert.ok(Math.abs(x.monthly - 888488) <= 2, `got ${x.monthly}`);
  assert.equal(x.remaining, 0);
  assert.equal(x.total - x.interest, 10000000);
});
test("early payoff", () => {
  const a = E.loan(1200000, 1200, 24),
    b = E.loan(1200000, 1200, 24, "annuity", 200000);
  assert.ok(b.schedule.length < a.schedule.length);
  assert.ok(b.interest < a.interest);
});
test("invalid imported data", () => {
  assert.throws(() =>
    E.valid({ version: 1, start: "2026-02-31", balance: 0, events: [] }),
  );
  assert.throws(() => E.valid({ ...s(), events: [e("a", "2026-10-09", -1)] }));
});
test("paid not projected", () => {
  assert.equal(
    E.project(
      s(100, [e("paid", "2026-10-09", 100, "expense", { paid: true })]),
      1,
    ).final,
    100,
  );
});
test("initial deficit remains visible even with same day income", () => {
  const p = E.project(s(-100, [e("salary", "2026-10-09", 1000, "income")]), 1);
  assert.equal(p.firstNegative, "2026-10-09");
  assert.equal(p.needed, 100);
  assert.equal(p.daysNegative, 0);
});
test("ancient weekly recurrence jumps to current horizon", () => {
  assert.deepEqual(
    E.occurrences(
      e("a", "1900-01-01", 100, "expense", { repeat: "weekly" }),
      "2026-10-09",
      "2026-10-20",
    ),
    ["2026-10-12", "2026-10-19"],
  );
});
test("twice monthly uses configured days after start", () => {
  assert.deepEqual(
    E.occurrences(
      e("a", "2026-10-09", 100, "income", { repeat: "twice" }),
      "2026-10-09",
      "2026-10-31",
    ),
    ["2026-10-10", "2026-10-25"],
  );
});
test("twice monthly clamps and deduplicates February", () => {
  assert.deepEqual(
    E.occurrences(
      e("a", "2025-01-01", 100, "income", { repeat: "twice", days: [30, 31] }),
      "2025-02-01",
      "2025-02-28",
    ),
    ["2025-02-28"],
  );
});
test("internal transfer does not change total balance", () => {
  assert.equal(
    E.project(s(100, [e("a", "2026-10-09", 50, "transfer")]), 1).final,
    100,
  );
});
test("invalid date and end ordering rejected", () => {
  assert.throws(() => E.date("2026-13-01"));
  assert.throws(() =>
    E.valid(
      s(0, [e("a", "2026-10-09", 100, "expense", { end: "2026-10-01" })]),
    ),
  );
});
test("malformed and duplicate imported operations rejected", () => {
  for (const events of [
    [null],
    [e("a", "2026-10-09", 100), e("a", "2026-10-09", 200)],
    [e("a", "2026-10-09", 100, "expense", { paid: "false" })],
    [e("a", "2026-10-09", 100, "expense", { category: {} })],
    [e("a", "2026-10-09", 100, "expense", { name: " " })],
  ])
    assert.throws(() => E.valid(s(0, events)));
});
test("untrusted JSON fields stripped", () => {
  const data = E.valid({ ...s(), secret: "not part of schema" });
  assert.equal(data.secret, undefined);
});
test("invalid preview rejected", () => {
  assert.throws(() => E.project(s(), 1, "base", [e("a", "2026-10-09", -100)]));
});
test("unsafe aggregate rejected", () => {
  const events = Array.from({ length: 5000 }, (_, i) =>
    e("a" + i, "2026-10-09", 1e12, "income", { repeat: "weekly" }),
  );
  assert.throws(() => E.project(s(0, events), 15), /точность/);
});
test("tiny nonzero interest remains numerically stable", () => {
  const x = E.loan(100000, 1, 600);
  assert.equal(x.remaining, 0);
  assert.equal(x.total - x.interest, 100000);
  assert.ok(x.interest > 0);
});
test("invalid loan kind and excessive extra rejected", () => {
  assert.throws(() => E.loan(100, 100, 12, "unknown"));
  assert.throws(() => E.loan(100, 100, 12, "annuity", 1e13));
});
test("authorship survives normalization, export and recurring projections", () => {
  const data = s(0, [e("a", "2026-10-09", 100, "income", { author: "test_user", repeat: "weekly" })]);
  assert.equal(E.valid(JSON.parse(JSON.stringify(data))).events[0].author, "test_user");
  assert.ok(E.project(data, 15).events.every(item => item.author === "test_user"));
  assert.equal(E.valid(s(0, [e("old", "2026-10-09", 100)])).events[0].author, undefined);
  for (const author of [null, {}, "<script>", "a".repeat(33)])
    assert.throws(() => E.valid(s(0, [e("bad", "2026-10-09", 100, "expense", { author })])));
});
test("recurrences stay within the supported date range at both boundaries", () => {
  for (const repeat of ["once", "weekly", "biweekly", "monthly", "twice"])
    for (const start of ["1000-01-01", "9999-12-01"])
      assert.ok(E.occurrences(e("edge", start, 1, "expense", { repeat }), start,
        start === "1000-01-01" ? "1000-02-28" : "9999-12-31")
        .every((d) => E.date(d) && d >= start && d <= (start === "1000-01-01" ? "1000-02-28" : "9999-12-31")));
  assert.deepEqual(E.occurrences(e("edge", "9999-12-31", 1, "expense", { repeat: "weekly" }),
    "9999-12-31", "9999-12-31"), ["9999-12-31"]);
});
test("monthly days 29 to 31 restore their anchor after February", () => {
  for (const year of [2024, 2025])
    for (const day of [29, 30, 31]) {
      const dates = E.occurrences(e("rent", `${year}-01-${day}`, 1, "expense", { repeat: "monthly" }),
        `${year}-01-01`, `${year}-03-31`);
      assert.deepEqual(dates, [`${year}-01-${day}`, `${year}-02-${year === 2024 ? 29 : 28}`, `${year}-03-${day}`]);
    }
});
test("weekly plans ending beyond year 9999 do not reject a valid final-day forecast", () => {
  for (const repeat of ["weekly", "biweekly"])
    assert.equal(E.project(s(123, [e("last", "9999-12-30", 1, "expense", { repeat })], "9999-12-31"), 1).final, 123);
});
test("money formatting keeps the existing Russian decimal and currency representation", () => {
  for (const cents of [0, 1, -2, 10005, 1e12, -1e12])
    assert.equal(E.amount(cents), (cents / 100).toLocaleString("ru-RU", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + " ₽");
});
console.log(`${count} financial tests passed`);
