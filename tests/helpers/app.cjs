// Boot the actual app and exercise its registered handlers, without patching source.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const E = require("../../engine.js"), C = require("../../chart-core.js");
const root = path.resolve(__dirname, "../..");
module.exports = function setup(events = [], options = {}) {
  let day = "2026-10-11", shared, projectCalls = 0;
  const nodes = new Map(), stored = new Map();
  stored.set("kontur:budget:v1", options.raw ?? JSON.stringify({
    version: 1, start: "2026-10-09", balance: 100000, events,
  }));
  const $ = (id) => {
    if (!nodes.has(id)) {
      const classes = new Set(), attributes = new Map();
      nodes.set(id, {
        id, value: id === "filter-ops" ? "all" : "", textContent: "", checked: false,
        hidden: false, innerHTML: "", open: false, dataset: {}, clientWidth: 600,
        classList: {
          toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
          contains: (name) => classes.has(name),
          remove: (name) => classes.delete(name),
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        removeAttribute: (name) => attributes.delete(name),
        getAttribute: (name) => attributes.get(name) ?? null,
        addEventListener(name, handler) { this["on" + name] = handler; },
        replaceChildren() { this.innerHTML = ""; }, reset() {}, focus() { this.focused = true; },
        showModal() { this.open = true; }, close() { this.open = false; },
      });
    }
    return nodes.get(id);
  };
  const tabs = ["overview", "operations", "calendar", "debts", "history", "settings", "account", "help"];
  const nav = tabs.map((id) => {
    const button = $("nav-" + id);
    button.dataset.tab = id;
    return button;
  });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [day + "T12:00:00"])); }
  }
  const context = vm.createContext({
    FinEngine: { ...E, project(...args) { projectCalls++; return E.project(...args); } },
    KonturChart: C, KonturBudgetCopy: require("../../budget-copy.js"), Date: Clock, crypto: require("node:crypto").webcrypto,
    window: { addEventListener() {} },
    document: {
      getElementById: $, documentElement: { dataset: { theme: "light" } },
      querySelector: () => nav.find((button) => button.classList.contains("selected")),
      querySelectorAll: (selector) => selector === ".tab" ? tabs.map($) : selector === "nav button" ? nav : [],
    },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem(key, value) {
        if (options.failStorage) throw Error("Storage unavailable");
        stored.set(key, value);
      },
    },
    SharedBudget: class {
      constructor(callbacks) { Object.assign(this, callbacks, { active: false, client: { user: null } }); shared = this; }
    },
    alert: (message) => { throw Error(message); },
    confirm: () => true,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
  const app = {
    openEvent(item = {}, specified) {
      if (specified) $("days").onclick({ target: { closest: () => ({ dataset: { newdate: specified } }) } });
      else if (item.id) $("ops").onclick({ target: { closest: () => ({ dataset: { edit: item.id } }) } });
      else $("add").onclick();
    },
    saveEvent: (event) => $("event-form").onsubmit(event),
    fillPayment: () => $("event-payment-planned").onchange(),
    resetPaymentDate: () => $("event-repeat").onchange(),
    changePaymentStatus: () => $("event-status").onchange(),
    setState: (data) => shared.onData(E.valid(data)), getState: () => shared.getData(),
  };
  return {
    app, $, stored, shared: () => shared, advance: (value) => { day = value; },
    save: () => app.saveEvent({ preventDefault() {} }),
    data: () => JSON.parse(stored.get("kontur:budget:v1")),
    tab: (id) => $("nav-" + id).onclick(),
    projectCalls: () => projectCalls,
  };
};
