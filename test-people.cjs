const assert = require("node:assert/strict");
const E = require("./engine.js"), S = require("./sync-core.js"), setup = require("./tests/helpers/app.cjs");
const day = "2026-10-11";
const old = { version: 1, start: "2026-10-09", balance: 100000, events: [
  { id: "food", name: "Продукты", type: "expense", cents: 10000, date: day,
    actuals: [{ plannedDate: day, date: day, cents: 8000 }] },
  { id: "salary", name: "Зарплата", type: "income", cents: 20000, date: day, person: 1,
    actuals: [{ plannedDate: day, date: day, cents: 20000 }] },
] };
let count = 0;
function test(name, fn) { fn(); count++; console.log("OK", name); }
const personal = () => E.setPersonalBalance(E.setPersonalBalance(old, 0, 150000, day, "Анна", "anna"), 1, 30000, day, "Иван", "ivan");
test("legacy migration preserves exact actual cash, ownership and future totals", () => {
  const data = personal(), actual = E.balanceNow(data, day);
  assert.equal(actual.balance, 180000);
  assert.deepEqual(actual.people.map((p) => p.balance), [150000, 30000]);
  assert.equal(data.balance, data.people[0].balance + data.people[1].balance);
  assert.equal(E.project(data, 30).final, actual.balance);
  assert.equal(data.events.find((e) => e.id === "food").person, 0);
  assert.equal(old.people, undefined);
  assert.deepEqual(E.valid(JSON.parse(JSON.stringify(data))), data);
});
test("actual payments affect selected person, plans and own-account transfers do not", () => {
  const data = personal();
  data.events.push({ id: "new", name: "Покупка", type: "expense", person: 1, cents: 500,
    date: day, actuals: [{ plannedDate: day, date: day, cents: 500 }] },
  { id: "plan", name: "План", type: "expense", person: 0, cents: 900, date: day },
  { id: "transfer", name: "Перевод", type: "transfer", person: 1, cents: 900, date: day,
    actuals: [{ plannedDate: day, date: day, cents: 900 }] });
  const actual = E.balanceNow(data, day);
  assert.deepEqual(actual.people.map((p) => p.balance), [150000, 29500]);
  assert.equal(actual.balance, actual.people.reduce((sum, p) => sum + p.balance, 0));
  assert.equal(E.balanceNow(E.setPersonalBalance(data, 1, 0, day, "Иван"), day).people[1].balance, 0);
});
test("invalid ownership, mismatched totals and duplicate accounts are rejected", () => {
  const data = personal();
  assert.throws(() => E.valid({ ...data, balance: data.balance + 1 }));
  assert.throws(() => E.valid({ ...data, people: [data.people[0]] }));
  assert.throws(() => E.valid({ ...data, events: [{ ...data.events[0], person: 2 }] }));
  assert.throws(() => E.setPersonalBalance(data, 1, -1, day, "Иван"));
  assert.throws(() => E.setPersonalBalance(data, 1, 0, day, "Иван", "anna"));
});
test("rebasing preserves each current amount and counts today's payment once", () => {
  const data = personal(), moved = E.rebase(data, day, day);
  assert.deepEqual(E.balanceNow(moved, day).people, E.balanceNow(data, day).people);
  assert.equal(E.balanceNow(moved, day).balance, 180000);
  assert.equal(E.project(moved, 30).final, 180000);
  assert.throws(() => E.rebase(data, "2026-10-12", day));
});
test("concurrent cash corrections require a whole-snapshot choice", () => {
  const base = personal(), local = E.setPersonalBalance(base, 0, 120000, day, "Анна"),
    remote = E.setPersonalBalance(base, 1, 40000, day, "Иван");
  assert.equal(S.merge(base, local, remote).conflicts[0].key, "snapshot");
  assert.deepEqual(S.merge(base, local, remote, { snapshot: "remote" }).data, remote);
  assert.deepEqual(S.merge(base, local, base).data, local);
});
test("snapshot undo restores legacy data and rejects newer participant edits", () => {
  const data = personal(), snapshot = (x) => ({ start: x.start, balance: x.balance, ...(x.people ? { people: x.people } : {}) });
  const entry = { event_id: null, before: snapshot(old), after: snapshot(data) };
  assert.equal(E.undo(data, entry).people, undefined);
  assert.throws(() => E.undo(E.setPersonalBalance(data, 1, 30000, day, "Другое имя"), entry));
});
test("intro is shown once, settings can correct today's balance and reload preserves it", () => {
  const h = setup([], { raw: JSON.stringify(old) });
  h.tab("overview"); assert.equal(h.$("money-dialog").open, true);
  h.$("money-name").value = "Анна"; h.$("money-amount").value = "1500";
  h.$("money-form").onsubmit({ preventDefault() {} });
  assert.equal(h.$("money-error").textContent, "");
  assert.equal(h.$("money-dialog").open, false);
  h.tab("settings");
  h.$("personal-person").value = "1"; h.$("personal-person").onchange();
  h.$("personal-name").value = "Иван"; h.$("personal-amount").value = "300";
  h.$("personal-form").onsubmit({ preventDefault() {} });
  assert.equal(h.$("personal-error").textContent, "");
  assert.equal(E.balanceNow(h.data(), day).balance, 180000);
  const reload = setup([], { raw: JSON.stringify(h.data()) });
  reload.tab("overview"); assert.equal(reload.$("money-dialog").open, false);
});
test("each cloud account receives its own intro and initialized accounts do not repeat it", () => {
  const h = setup([], { raw: JSON.stringify(old) }), shared = h.shared();
  Object.assign(shared, { active: true, remote: { id: "test-budget", owner: false },
    client: { user: { id: "second", email: "ivan" + "@" + "users.kontur.invalid" } } });
  shared.onAccount({ active: true, connected: true, signedIn: true, busy: false });
  assert.equal(h.$("money-dialog").open, true);
  assert.equal(h.$("money-person").value, "1");
  h.$("money-dialog").close();
  h.app.setState(personal());
  shared.onAccount({ active: true, connected: true, signedIn: true, busy: false });
  assert.equal(h.$("money-dialog").open, false);
});
test("entered names appear in overview and operation owner choices", () => {
  const h = setup([], { raw: JSON.stringify(personal()) });
  h.tab("overview");
  assert.equal(h.$("person-name-0").textContent, "Анна");
  assert.equal(h.$("person-name-1").textContent, "Иван");
  assert.match(h.$("event-person").innerHTML, /Анна/);
  assert.match(h.$("event-person").innerHTML, /Иван/);
  assert.match(h.$("personal-note").textContent, /Анна \+ Иван/);
});
test("stale settings cannot overwrite cash received from another device", () => {
  const h = setup([], { raw: JSON.stringify(personal()) });
  h.tab("settings");
  h.app.setState(E.setPersonalBalance(h.app.getState(), 0, 170000, day, "Анна"));
  h.$("personal-amount").value = "1900";
  h.$("personal-form").onsubmit({ preventDefault() {} });
  assert.match(h.$("personal-error").textContent, /изменились/);
  assert.equal(E.balanceNow(h.app.getState(), day).people[0].balance, 170000);
});
test("kopecks with comma or dot are saved exactly through intro and settings", () => {
  const h = setup([], { raw: JSON.stringify(old) });
  h.tab("overview");
  h.$("money-name").value = "Анна"; h.$("money-amount").value = "1 234,56";
  h.$("money-form").onsubmit({ preventDefault() {} });
  assert.equal(h.$("money-error").textContent, "");
  assert.equal(E.balanceNow(h.data(), day).people[0].balance, 123456);
  h.tab("settings"); h.$("personal-person").value = "1"; h.$("personal-person").onchange();
  h.$("personal-name").value = "Иван"; h.$("personal-amount").value = "2000.07";
  h.$("personal-form").onsubmit({ preventDefault() {} });
  assert.equal(E.balanceNow(h.data(), day).people[1].balance, 200007);
  assert.equal(E.balanceNow(h.data(), day).balance, 323463);
});
test("incomplete shared cash shows no deficit or invented zero and becomes complete after entry", () => {
  const partial = E.setPersonalBalance(old, 0, 100, day, "Анна");
  const h = setup([], { raw: JSON.stringify(partial) });
  h.tab("overview");
  for (const id of ["balance-now", "minimum", "ending", "needed"])
    assert.equal(h.$(id).textContent, "—");
  assert.equal(h.$("person-now-1").textContent, "Не указано");
  assert.equal(h.$("forecast-panel").hidden, true);
  assert.equal(h.$("minimum").classList.contains("negative"), false);
  assert.match(h.$("notice").textContent, /Прогноз появится/);
  h.tab("calendar"); assert.ok(!h.$("days").innerHTML.includes('class="negative"'));
  h.app.setState(E.setPersonalBalance(partial, 1, 200000, day, "Иван"));
  h.tab("overview");
  assert.equal(h.$("forecast-panel").hidden, false);
  assert.equal(h.$("balance-now").textContent, E.amount(200100));
  assert.equal(h.$("minimum").textContent, E.amount(200100));
});
test("current forecast ignores old unconfirmed plans and does not repeat today's facts", () => {
  const data = personal();
  data.events.push({ id: "old-plan", name: "Старый план", type: "expense", cents: 2025000, date: "2026-10-10" });
  assert.ok(E.project(data, 30).min < 0);
  const fromNow = E.projectCurrent(data, day, 30);
  assert.equal(fromNow.start, day);
  assert.equal(fromNow.min, 180000);
  assert.equal(fromNow.final, 180000);
  assert.equal(fromNow.events.length, 0);
  data.events.push({ id: "future-plan", name: "Будущий платёж", type: "expense", cents: 40000, date: "2026-10-12" });
  assert.equal(E.projectCurrent(data, day, 30).min, 140000);
});
console.log(count + " participant budget tests passed");
