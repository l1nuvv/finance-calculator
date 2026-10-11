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
  await test("upcoming operations preserve recent-first order and the eight-item limit", () => {
    const h = setup(Array.from({ length: 10 }, (_, i) => event("payment-" + i, `2026-10-${10 + i}`)));
    h.tab("overview");
    const html = h.$("upcoming").innerHTML;
    assert.ok(html.indexOf("payment-9") < html.indexOf("payment-2"));
    assert.ok(!html.includes("payment-0") && !html.includes("payment-1"));
  });
  await test("untrusted operation text is escaped in the rendered list", () => {
    const h = setup([event("xss", undefined, { name: '<img src=x onerror="bad()">', category: "<script>" })]);
    h.tab("operations");
    assert.ok(!h.$("ops").innerHTML.includes("<img"));
    assert.ok(h.$("ops").innerHTML.includes("&lt;img"));
    assert.ok(h.$("ops").innerHTML.includes("&lt;script&gt;"));
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
