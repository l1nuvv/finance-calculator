const assert = require("node:assert/strict"),
  C = require("./chart-core.js");
for (const values of [
  [0],
  [1000000, 2500000, -250000, 3000000],
  [1, 2, 3],
  [-50000, -20],
  [1000000000000, -1000000000000],
]) {
  const s = C.scale(values);
  assert(s.lower <= Math.min(...values));
  assert(s.upper >= Math.max(...values));
  assert(s.upper > s.lower);
  assert(s.ticks.includes(0));
  assert(s.ticks.length <= 7);
  assert(Number.isInteger(s.step));
}
const familiar = C.scale([2500000, -250000, 3000000]);
assert.equal(familiar.step, 1000000);
assert.deepEqual(familiar.ticks, [-1000000, 0, 1000000, 2000000, 3000000]);
for (const length of [1, 7, 30, 365])
  for (const width of [190, 300, 800]) {
    const dates = C.dates(length, width);
    assert.equal(dates[0], 0);
    assert.equal(dates.at(-1), length - 1);
    assert.equal(new Set(dates).size, dates.length);
    for (const i of dates)
      assert.equal(
        C.nearest(
          66 + (i * width) / Math.max(1, length - 1),
          66,
          66 + width,
          length,
        ),
        i,
      );
  }
assert.equal(C.nearest(-500, 66, 600, 30), 0);
assert.equal(C.nearest(999, 66, 600, 30), 29);
console.log(
  "Chart checks passed: round scale, intermediate dates, exact day selection and edges",
);
