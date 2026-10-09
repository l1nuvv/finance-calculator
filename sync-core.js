(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./engine.js"));
  else root.KonturSync = factory(root.FinEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Merge disjoint edits, including deletions. Conflicting values require an explicit choice.
  function merge(base, local, remote, choices = {}) {
    base = E.valid(base);
    local = E.valid(local);
    remote = E.valid(remote);
    const conflicts = [];
    function pick(key, b, l, r) {
      if (equal(l, r) || equal(b, r)) return l;
      if (equal(b, l)) return r;
      if (choices[key] === "local") return l;
      if (choices[key] === "remote") return r;
      conflicts.push({ key, local: l, remote: r });
      return l;
    }
    // Date and balance form one accounting snapshot and must be merged atomically.
    const snapshot = pick(
      "snapshot",
      [base.start, base.balance],
      [local.start, local.balance],
      [remote.start, remote.balance],
    );
    const maps = [base, local, remote].map(
      (x) => new Map(x.events.map((e) => [e.id, e])),
    );
    const events = [];
    for (const id of new Set(maps.flatMap((x) => [...x.keys()]))) {
      const e = pick("event:" + id, ...maps.map((x) => x.get(id)));
      if (e !== undefined) events.push(e);
    }
    return {
      data: E.valid({
        version: 1,
        start: snapshot[0],
        balance: snapshot[1],
        events,
      }),
      conflicts,
    };
  }
  return { merge, equal };
});
