const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync("cloud.js", "utf8"),
  key = "kontur:session",
  config = { supabaseUrl: "https://cloud.example.test", supabaseKey: "public-test-key" };
const testEmail = "test_user" + "@" + "users.kontur.invalid";
const session = (extra = {}) => ({
  user: { id: "test-user", email: testEmail },
  access_token: "test-access", refresh_token: "test-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600, ...extra,
});
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}
function browser(localStorage = storage(), sessionStorage = storage(), fetch = async () => {
  throw new TypeError("offline");
}, navigator = {}) {
  const listeners = {};
  const context = vm.createContext({
    localStorage, sessionStorage, fetch, navigator, AbortSignal,
    addEventListener: (name, fn) => { listeners[name] = fn; },
  });
  vm.runInContext(source, context);
  return { client: new context.KonturCloud(config), listeners };
}
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => data });
let count = 0;
async function test(name, fn) {
  await fn();
  console.log("OK", name);
  count++;
}
(async () => {
  await test("login survives new tabs and reopening the browser without storing the password", async () => {
    const persistent = storage(), tab = storage();
    const { client } = browser(persistent, tab, async () => response({ ...session(), expires_in: 3600 }));
    await client.signIn(testEmail, "test-password");
    assert.equal(tab.getItem(key), null);
    assert.equal(persistent.getItem(key).includes("test-password"), false);
    for (let i = 0; i < 2; i++) {
      const reopened = browser(persistent).client;
      assert.equal(reopened.user.id, "test-user");
      await reopened.token();
    }
  });
  await test("old tab sessions migrate to persistent storage", async () => {
    const persistent = storage(), tab = storage({ [key]: JSON.stringify(session()) });
    const { client } = browser(persistent, tab);
    assert.equal(client.user.id, "test-user");
    assert.equal(tab.getItem(key), null);
    assert.equal(browser(persistent).client.user.id, "test-user");
  });
  await test("malformed stored sessions show no authenticated user", async () => {
    for (const raw of ["{broken", JSON.stringify({ access_token: "test" }), "null"])
      assert.equal(browser(storage({ [key]: raw })).client.user, null);
  });
  await test("expiry refresh is saved and shared across concurrently opened tabs", async () => {
    const persistent = storage({ [key]: JSON.stringify(session({ expires_at: 0 })) });
    let calls = 0, tail = Promise.resolve();
    const navigator = { locks: { request(name, fn) {
      assert.equal(name, "kontur:session-refresh");
      const next = tail.then(fn);
      tail = next.catch(() => {});
      return next;
    } } };
    const fetch = async (url, options) => {
      calls++;
      assert.match(url, /grant_type=refresh_token/);
      assert.equal(JSON.parse(options.body).refresh_token, "test-refresh");
      return response({ ...session({ refresh_token: "test-rotated" }), expires_in: 3600 });
    };
    const a = browser(persistent, storage(), fetch, navigator).client,
      b = browser(persistent, storage(), fetch, navigator).client;
    await Promise.all([a.token(), a.token(), b.token()]);
    assert.equal(calls, 1);
    assert.equal(b.session.refresh_token, "test-rotated");
    assert.equal(browser(persistent).client.session.refresh_token, "test-rotated");
  });
  await test("network failure retains the session for offline reopening", async () => {
    const persistent = storage({ [key]: JSON.stringify(session({ expires_at: 0 })) });
    const { client } = browser(persistent);
    await assert.rejects(() => client.token(), /offline/);
    assert.equal(client.user.id, "test-user");
    assert.equal(browser(persistent).client.user.id, "test-user");
  });
  await test("revoked refresh token clears saved login", async () => {
    const persistent = storage({ [key]: JSON.stringify(session({ expires_at: 0 })) });
    const { client } = browser(persistent, storage(), async () => response({
      error_code: "refresh_token_not_found", message: "Refresh Token Not Found",
    }, false));
    await assert.rejects(() => client.token(), /Войдите заново/);
    assert.equal(client.user, null);
    assert.equal(persistent.getItem(key), null);
  });
  await test("explicit logout clears both stores even without network", async () => {
    const persistent = storage({ [key]: JSON.stringify(session()) }), tab = storage();
    const { client } = browser(persistent, tab);
    await assert.rejects(() => client.signOut(), /offline/);
    assert.equal(client.user, null);
    assert.equal(persistent.getItem(key), null);
    assert.equal(tab.getItem(key), null);
    assert.equal(browser(persistent).client.user, null);
  });
  await test("another tab's logout is observed and cannot be resurrected by refresh", async () => {
    const persistent = storage({ [key]: JSON.stringify(session({ expires_at: 0 })) });
    const { client, listeners } = browser(persistent, storage(), async () => {
      persistent.removeItem(key);
      listeners.storage({ key });
      return response({ ...session(), expires_in: 3600 });
    });
    let changed = 0;
    client.onSessionChange = () => changed++;
    await client.token();
    assert.equal(changed, 1);
    assert.equal(client.user, null);
    assert.equal(persistent.getItem(key), null);
  });
  await test("switching accounts in another tab never sends the old budget", async () => {
    const persistent = storage({ [key]: JSON.stringify(session()) });
    let calls = 0;
    const { client } = browser(persistent, storage(), async () => { calls++; return response({}); });
    persistent.setItem(key, JSON.stringify(session({ user: { id: "other-user", email: "other" + "@" + "users.kontur.invalid" } })));
    await assert.rejects(() => client.save(1, { events: [] }), /Аккаунт изменился/);
    assert.equal(calls, 0);
  });
  await test("responses from an account left during a request cannot be adopted", async () => {
    const persistent = storage({ [key]: JSON.stringify(session()) });
    const { client, listeners } = browser(persistent, storage(), async () => {
      persistent.removeItem(key);
      listeners.storage({ key });
      return response({ id: "private-old-budget" });
    });
    await assert.rejects(() => client.read(), /Аккаунт изменился/);
    assert.equal(client.user, null);
  });
  await test("an old refresh error never signs out a newly selected account", async () => {
    const persistent = storage({ [key]: JSON.stringify(session({ expires_at: 0 })) });
    const replacement = session({
      user: { id: "other-user", email: "other" + "@" + "users.kontur.invalid" },
      refresh_token: "test-other-refresh",
    });
    const { client, listeners } = browser(persistent, storage(), async () => {
      persistent.setItem(key, JSON.stringify(replacement));
      listeners.storage({ key });
      return response({ error_code: "refresh_token_not_found" }, false);
    });
    await assert.rejects(() => client.token());
    assert.equal(client.user.id, "other-user");
    assert.equal(browser(persistent).client.user.id, "other-user");
  });
  await test("blocked persistent storage still supports login in the current tab", async () => {
    const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
    const tab = storage(), { client } = browser(blocked, tab);
    client.remember(session());
    await client.token();
    assert.equal(client.user.id, "test-user");
    assert.equal(browser(blocked, tab).client.user.id, "test-user");
    client.remember(null);
    assert.equal(tab.getItem(key), null);
  });
  console.log(`${count} cloud session tests passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
