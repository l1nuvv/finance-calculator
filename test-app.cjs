const assert = require("node:assert/strict"), setup = require("./tests/helpers/app.cjs");
const event = (id, date = "2026-10-11", extra = {}) => ({
  id, name: id, type: "expense", date, cents: 100, ...extra,
});
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("OK", name); }
(async () => {
  await test("tab switching reuses the forecast and every input invalidates it", () => {
    const h = setup([event("planned")]);
    h.tab("overview");
    assert.equal(h.projectCalls(), 1);
    h.tab("calendar"); h.tab("overview");
    assert.equal(h.projectCalls(), 1);
    h.$("period").onchange({ target: { value: "7" } });
    assert.equal(h.projectCalls(), 2);
    h.$("scenario").onchange({ target: { value: "conservative" } });
    assert.equal(h.projectCalls(), 3);
    h.app.setState({ ...h.app.getState(), balance: 200000 });
    assert.equal(h.projectCalls(), 4);
    assert.equal(h.$("ending").textContent, "1 999,00 ₽");
  });
  await test("saving reuses the validated forecast when drawing the overview", () => {
    const h = setup(); h.tab("overview");
    const before = h.projectCalls();
    h.$("balance").value = "1234";
    h.$("apply").onclick();
    assert.equal(h.projectCalls(), before + 1);
    assert.equal(h.data().balance, 123400);
    assert.equal(h.$("ending").textContent, "1 234,00 ₽");
  });
  await test("upcoming operations start today and show the nearest eight first", () => {
    const h = setup(Array.from({ length: 10 }, (_, i) => event("payment-" + i, `2026-10-${10 + i}`)));
    h.tab("overview");
    const html = h.$("upcoming").innerHTML;
    const names = [...html.matchAll(/entry-title">([^<]+)/g)].map((match) => match[1]);
    assert.deepEqual(names, Array.from({ length: 8 }, (_, i) => "payment-" + (i + 1)));
    assert.equal(h.$("up-count").textContent, "Показано 8 из 9 · от сегодня");
    h.advance("2026-10-18"); h.tab("overview");
    assert.ok(!h.$("upcoming").innerHTML.includes('entry-title">payment-7<'));
    assert.match(h.$("upcoming").innerHTML, /entry-title">payment-8</);
  });
  await test("upcoming excludes completed payments and works beyond an old forecast end", () => {
    const h = setup([
      event("done", "2026-10-11", { actuals: [{ plannedDate: "2026-10-11", date: "2026-10-11", cents: 100 }] }),
      event("today-plan"),
      event("monthly", "2026-10-10", { repeat: "monthly" }),
      event("own-transfer", "2026-11-12", { type: "transfer" }),
    ]);
    h.tab("overview");
    assert.ok(!h.$("upcoming").innerHTML.includes("done"));
    assert.match(h.$("upcoming").innerHTML, /today-plan/);
    h.advance("2026-11-09"); h.tab("overview");
    assert.match(h.$("upcoming").innerHTML, /monthly/);
    assert.ok(!h.$("upcoming").innerHTML.includes("done"));
    assert.ok(!h.$("upcoming").innerHTML.includes("own-transfer"));
    assert.match(h.$("up-count").textContent, /1 из 1/);
  });
  await test("untrusted operation text is escaped in the rendered list", () => {
    const h = setup([event("xss", undefined, { name: '<img src=x onerror="bad()">', category: "<script>" })]);
    h.tab("operations");
    assert.ok(!h.$("ops").innerHTML.includes("<img"));
    assert.ok(h.$("ops").innerHTML.includes("&lt;img"));
    assert.ok(h.$("ops").innerHTML.includes("&lt;script&gt;"));
  });
  await test("operation filters report results and reset together", () => {
    const h = setup([event("rent"), event("salary", undefined, { type: "income" })]);
    h.tab("operations");
    assert.equal(h.$("ops-count").textContent, "Показано: 2 из 2");
    assert.equal(h.$("clear-ops").hidden, true);
    h.$("search-ops").value = "rent";
    h.$("filter-ops").value = "income";
    h.$("filter-ops").onchange();
    assert.equal(h.$("ops-count").textContent, "Показано: 0 из 2");
    assert.equal(h.$("clear-ops").hidden, false);
    h.$("clear-ops").onclick();
    assert.equal(h.$("search-ops").value, "");
    assert.equal(h.$("filter-ops").value, "all");
    assert.equal(h.$("ops-count").textContent, "Показано: 2 из 2");
    assert.equal(h.$("clear-ops").hidden, true);
    assert.equal(h.$("search-ops").focused, true);
  });
  await test("corrupt persisted data stays protected until an explicit recovery import", async () => {
    const raw = "{broken", h = setup([], { raw });
    h.app.openEvent(); h.$("event-name").value = "Purchase"; h.$("event-amount").value = "1"; h.save();
    assert.match(h.$("error").textContent, /повреждены/);
    assert.equal(h.stored.get("kontur:budget:v1"), raw);
    const imported = { version: 1, start: "2026-10-09", balance: 123, events: [] };
    const input = { files: [{ size: 100, text: async () => JSON.stringify(imported) }], value: "import" };
    await h.$("import").onchange({ target: input });
    assert.deepEqual(h.data(), imported);
    assert.equal(input.value, "");
    assert.equal(h.$("export-corrupt").hidden, true);
  });
  await test("failed local writes keep edits in memory and show recovery guidance", () => {
    const h = setup([], { failStorage: true });
    h.app.openEvent(); h.$("event-name").value = "Purchase"; h.$("event-amount").value = "1"; h.save();
    assert.equal(h.app.getState().events.length, 1);
    assert.equal(h.data().events.length, 0);
    assert.match(h.$("saved").textContent, /Не удалось сохранить/);
    assert.match(h.$("storage-warning").textContent, /Экспортируйте JSON/);
  });
  await test("local history undo restores the budget through the real handler", async () => {
    const h = setup(); h.app.openEvent();
    h.$("event-name").value = "Purchase"; h.$("event-amount").value = "1"; h.save();
    const entry = JSON.parse(h.stored.get("kontur:history:v1"))[0];
    h.tab("history");
    await h.$("history-list").onclick({ target: { closest: () => ({ dataset: { undo: entry.id } }) } });
    assert.equal(h.data().events.length, 0);
    assert.equal(JSON.parse(h.stored.get("kontur:history:v1"))[0].undo_of, entry.id);
  });
  await test("history describes confidence-only changes and repetition end dates in Russian", () => {
    const h = setup([event("rent", "2026-10-15", { repeat: "monthly", confidence: "confirmed" })]);
    h.app.openEvent(h.app.getState().events[0]);
    h.$("event-confidence").value = "expected";
    h.save();
    h.tab("history");
    let html = h.$("history-list").innerHTML;
    assert.match(html, /Надёжность поступления: Подтверждено/);
    assert.match(html, /Надёжность поступления: Ожидается/);
    assert.match(html, /Повторение: Каждый месяц/);
    assert.ok(!html.includes("monthly") && !html.includes("обязательность по типу"));
    h.app.openEvent(h.app.getState().events[0]);
    h.$("event-end").value = "2027-01-15";
    h.save();
    h.tab("history");
    html = h.$("history-list").innerHTML;
    assert.match(html, /Повторять до: без даты окончания/);
    assert.match(html, /Повторять до: 15 января 2027/);
  });
  await test("theme changes update the accessible state and device preference", () => {
    const h = setup();
    h.$("theme-toggle").onclick();
    assert.equal(h.stored.get("kontur:theme"), "dark");
    assert.equal(h.$("theme-toggle").getAttribute("aria-pressed"), "true");
    h.$("theme-toggle").onclick();
    assert.equal(h.stored.get("kontur:theme"), "light");
    assert.equal(h.$("theme-toggle").getAttribute("aria-pressed"), "false");
  });
  console.log(`${count} application tests passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
