// Synthetic, deterministic workloads. No real budgets or browser storage.
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const path = require("node:path");
const E = require(path.resolve(process.argv[2] || "engine.js"));
function measure(run, iterations = 7) {
  run();
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return +times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(3);
}
const results = [];
for (const count of [30, 300, 3000]) {
  const data = {
    version: 1, start: "2026-10-09", balance: 10000000,
    events: Array.from({ length: count }, (_, i) => ({
      id: "synthetic-" + i, name: "Synthetic " + i,
      type: ["income", "expense", "borrow", "repay", "transfer"][i % 5],
      date: "2024-01-31", cents: 10000 + i,
      repeat: ["once", "weekly", "biweekly", "monthly", "twice"][i % 5],
      confidence: i % 3 ? "confirmed" : "expected",
      actuals: [{ plannedDate: "2024-01-31", date: "2026-10-10", cents: 9000 + i }],
      ...(i % 5 === 4 ? { days: [15, 31] } : {}),
    })),
  };
  for (const days of [7, 30, 90, 365]) {
    const run = () => E.project(data, days);
    results.push({ count, days, projectMs: measure(run),
      digest: createHash("sha256").update(JSON.stringify(run())).digest("hex").slice(0, 16) });
  }
  results.push({ count, obligationsMs: measure(() => E.obligations(data, "2026-10-11")) });
}
results.push({ format1000Ms: measure(() => {
  for (let i = 0; i < 1000; i++) E.amount(10000 + i);
}) });
console.log(JSON.stringify({ node: process.version, results }, null, 2));
