const assert = require("node:assert/strict"),
  E = require("./engine.js"),
  boot = require("./tests/helpers/app.cjs");
function setup(events = []) {
  const h = boot(events);
  h.tab("operations");
  return h;
}
const event = (extra = {}) => ({
  id: "rent", name: "Аренда", type: "expense", date: "2026-10-10",
  cents: 10000, repeat: "monthly", ...extra,
});
let count = 0;
function test(name, fn) { fn(); count++; console.log("OK", name); }

test("new purchase is saved as completed once with today's local date", () => {
  const h = setup(); h.app.openEvent();
  assert.equal(h.$("event-date").value, "2026-10-11");
  assert.equal(h.$("event-status").value, "actual");
  assert.equal(h.$("event-payment").hidden, true);
  h.$("event-name").value = "Покупка"; h.$("event-amount").value = "800"; h.save();
  assert.equal(h.$("error").textContent, "");
  assert.equal(h.$("dialog").open, false);
  const data = h.data();
  assert.equal(E.balanceNow(data, "2026-10-11").balance, 20000);
  assert.equal(E.project(data, 30).events.length, 1);
  assert.doesNotMatch(h.$("ops").innerHTML, /data-fact|>Факт</);
  h.advance("2026-10-12"); h.app.openEvent();
  assert.equal(h.$("event-date").value, "2026-10-12");
});
test("future calendar date creates a plan without changing current balance", () => {
  const h = setup(); h.app.openEvent({}, "2026-10-20");
  assert.equal(h.$("event-status").value, "planned");
  h.$("event-name").value = "Платёж"; h.$("event-amount").value = "100"; h.save();
  assert.equal(E.balanceNow(h.data(), "2026-10-11").balance, 100000);
  assert.equal(E.project(h.data(), 30).final, 90000);
});
test("existing plan can be completed in the same edit form", () => {
  const h = setup([event({ repeat: "once", end: "2026-10-10" })]); h.app.openEvent(h.app.getState().events[0]);
  h.$("event-status").value = "actual"; h.app.changePaymentStatus();
  assert.equal(h.$("event-date").value, "2026-10-11");
  h.$("event-amount").value = "80"; h.save();
  assert.equal(E.balanceNow(h.data(), "2026-10-11").balance, 92000);
  assert.equal(E.project(h.data(), 30).events.length, 1);
  assert.equal(h.data().events[0].cents, 10000);
  assert.equal(h.data().events[0].actuals[0].plannedDate, "2026-10-10");
  h.app.openEvent(h.app.getState().events[0]);
  h.$("event-status").value = "planned"; h.app.changePaymentStatus(); h.save();
  assert.equal(h.data().events[0].date, "2026-10-10");
  assert.equal(h.data().events[0].actuals.length, 0);
  assert.equal(E.balanceNow(h.data(), "2026-10-11").balance, 100000);
});
test("received income is counted immediately even if its plan was uncertain", () => {
  const h = setup(); h.app.openEvent();
  h.$("event-name").value = "Премия"; h.$("event-type").value = "income";
  h.$("event-confidence").value = "expected"; h.$("event-amount").value = "200"; h.save();
  assert.equal(E.balanceNow(h.data(), "2026-10-11").balance, 120000);
  assert.equal(E.project(h.data(), 30, "conservative").final, 120000);
});
test("old completed purchase keeps its saved date and original plan on edit", () => {
  const h = setup([event({ repeat: "once", actuals: [{ plannedDate: "2026-10-10", date: "2026-10-09", cents: 8000 }] })]);
  h.app.openEvent(h.app.getState().events[0]);
  assert.equal(h.$("event-date").value, "2026-10-09");
  assert.equal(h.$("event-amount").value, "80.00");
  h.$("event-name").value = "Новое название"; h.save();
  assert.equal(h.data().events[0].date, "2026-10-10");
  assert.equal(h.data().events[0].actuals[0].date, "2026-10-09");
});
test("recurring overdue payment starts with today's date and keeps later months planned", () => {
  const h = setup([event()]); h.app.openEvent(h.app.getState().events[0]);
  assert.equal(h.$("event-payment-planned").value, "2026-10-10");
  assert.equal(h.$("event-payment-date").value, "2026-10-11");
  h.$("event-status").value = "actual"; h.$("event-payment-amount").value = "80"; h.save();
  const p = E.project(h.data(), 40);
  assert.equal(p.events.length, 2); assert.equal(p.events[0].cents, 8000);
  assert.equal(p.events[1].cents, 10000); assert.equal(p.events[1].actual, false);
});
test("returning one recurring payment to plan preserves other completed payments", () => {
  const h = setup([event({ date: "2026-09-10", actuals: [
    { plannedDate: "2026-09-10", date: "2026-09-10", cents: 10000 },
    { plannedDate: "2026-10-10", date: "2026-10-09", cents: 8000 },
  ] })]);
  h.app.openEvent(h.app.getState().events[0]);
  h.$("event-payment-planned").value = "2026-10-10"; h.app.fillPayment();
  assert.equal(h.$("event-status").value, "actual");
  h.$("event-status").value = "planned"; h.save();
  assert.deepEqual(h.data().events[0].actuals.map((f) => f.plannedDate), ["2026-09-10"]);
});
test("new twice-monthly operation chooses a valid scheduled occurrence", () => {
  const h = setup(); h.app.openEvent();
  h.$("event-name").value = "Зарплата"; h.$("event-type").value = "income";
  h.$("event-amount").value = "100"; h.$("event-repeat").value = "twice";
  h.app.resetPaymentDate(); h.save();
  assert.equal(h.$("error").textContent, "");
  assert.equal(h.data().events[0].actuals[0].plannedDate, "2026-10-25");
});
test("remote changes are not overwritten by a stale payment form", () => {
  const h = setup([event()]); h.app.openEvent(h.app.getState().events[0]);
  h.app.setState({ ...h.app.getState(), events: [event({ cents: 20000 })] });
  h.$("event-status").value = "actual"; h.save();
  assert.match(h.$("error").textContent, /другом устройстве/);
  assert.equal(h.app.getState().events[0].cents, 20000);
  assert.equal(h.$("dialog").open, true);
});
test("future actual date is rejected without saving", () => {
  const h = setup(); h.app.openEvent();
  h.$("event-name").value = "Платёж"; h.$("event-amount").value = "100";
  h.$("event-date").value = "2026-10-20"; h.save();
  assert.match(h.$("error").textContent, /Запланировано/);
  assert.equal(h.app.getState().events.length, 0);
});
console.log(`${count} payment form tests passed`);
