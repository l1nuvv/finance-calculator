const assert = require("node:assert/strict"), E = require("./engine.js"), copy = require("./budget-copy.js");
const event = E.valid({ version: 1, start: "2026-10-12", balance: 0, events: [{
  id: "rent", name: "Аренда", type: "expense", cents: 3000000,
  date: "2026-10-12", repeat: "monthly", confidence: "confirmed",
}] }).events[0];
const local = { ...event, actuals: [{ plannedDate: "2026-10-12", date: "2026-10-13", cents: 2900000 }] };
const remote = { ...event, actuals: [{ plannedDate: "2026-10-12", date: "2026-10-14", cents: 3100000 }] };
const localText = copy.describeEvent(local), remoteText = copy.describeEvent(remote);
assert.notEqual(localText, remoteText);
assert.ok(localText.includes(E.amount(2900000)) && localText.includes("13 октября 2026"));
assert.ok(remoteText.includes(E.amount(3100000)) && remoteText.includes("14 октября 2026"));
assert.ok(localText.includes("Обязательный расход: да"));
assert.ok(localText.includes("Основной доход: нет"));
for (const patch of [{ end: "2027-01-12" }, { required: false }, { salary: true }, { confidence: "expected" }, { days: [5, 20] }, { paid: true }])
  assert.notEqual(copy.describeEvent(event), copy.describeEvent({ ...event, ...patch }));
assert.match(copy.describeEvent({ ...event, repeat: "twice", days: [5, 20] }), /Дни месяца: 5, 20/);
assert.match(copy.describeEvent({ ...event, repeat: "twice" }), /Дни месяца: 10, 25/);
assert.match(copy.describeEvent({ ...event, type: "income" }), /Основной доход: да/);
assert.equal(copy.describeEvent(undefined), "Удалено");
console.log("Budget descriptions distinguish payments and every editable setting");
