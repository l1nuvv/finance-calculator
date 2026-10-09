(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  else root.FinEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000,
    MAX = 1e12;
  function money(value) {
    const s = String(value ?? "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) throw Error("Некорректная сумма");
    const [whole, fraction = ""] = s.split(".");
    const n =
      (BigInt(whole.replace("-", "")) * 100n +
        BigInt(fraction.padEnd(2, "0"))) *
      (s.startsWith("-") ? -1n : 1n);
    if (n > BigInt(MAX) || n < -BigInt(MAX))
      throw Error("Сумма слишком велика");
    return Number(n);
  }
  function amount(cents) {
    return (
      (cents / 100).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " ₽"
    );
  }
  function date(s) {
    if (typeof s !== "string" || !/^[1-9]\d{3}-\d\d-\d\d$/.test(s))
      throw Error("Неверная дата (1000–9999 год)");
    const d = new Date(s + "T12:00:00Z");
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      throw Error("Неверная дата");
    return d;
  }
  function shift(s, n) {
    if (!Number.isInteger(n)) throw Error("Некорректное смещение даты");
    const d = date(s);
    d.setUTCDate(d.getUTCDate() + n);
    const result = d.toISOString().slice(0, 10);
    date(result);
    return result;
  }
  function monthShift(s, n) {
    date(s);
    if (!Number.isInteger(n)) throw Error("Некорректное смещение месяца");
    const [y, m, day] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
    const last = new Date(
      Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    t.setUTCDate(Math.min(day, last));
    const result = t.toISOString().slice(0, 10);
    date(result);
    return result;
  }
  function valid(x) {
    if (
      !x ||
      typeof x !== "object" ||
      Array.isArray(x) ||
      !Array.isArray(x.events)
    )
      throw Error("Неверный формат данных");
    if (x.version !== 1) throw Error("Неподдерживаемая версия данных");
    date(x.start);
    if (!Number.isSafeInteger(x.balance) || Math.abs(x.balance) > MAX)
      throw Error("Неверный баланс");
    if (x.events.length > 5000) throw Error("Слишком много операций");
    const ids = new Set();
    for (const e of x.events) {
      if (
        !e ||
        typeof e !== "object" ||
        Array.isArray(e) ||
        typeof e.id !== "string" ||
        !e.id.trim() ||
        e.id.length > 100 ||
        ids.has(e.id) ||
        typeof e.name !== "string" ||
        !e.name.trim() ||
        e.name.length > 150 ||
        !["income", "expense", "borrow", "repay", "transfer"].includes(
          e.type,
        ) ||
        !Number.isSafeInteger(e.cents) ||
        e.cents < 0 ||
        e.cents > MAX ||
        !["once", "weekly", "biweekly", "monthly", "twice"].includes(
          e.repeat ?? "once",
        ) ||
        !["expected", "confirmed", "actual"].includes(
          e.confidence ?? "confirmed",
        ) ||
        (e.category !== undefined &&
          (typeof e.category !== "string" || e.category.length > 40)) ||
        (e.paid !== undefined && typeof e.paid !== "boolean") ||
        (e.author !== undefined &&
          (typeof e.author !== "string" ||
            !/^[a-z0-9_-]{3,32}$/.test(e.author))) ||
        (e.required !== undefined && typeof e.required !== "boolean") ||
        (e.salary !== undefined && typeof e.salary !== "boolean")
      )
        throw Error("Некорректная операция или повторяющийся ID");
      ids.add(e.id);
      date(e.date);
      if (e.end !== undefined) {
        date(e.end);
        if (e.end < e.date) throw Error("Дата окончания раньше начала");
      }
      if (
        e.days !== undefined &&
        (!Array.isArray(e.days) ||
          !e.days.length ||
          e.days.length > 31 ||
          e.days.some((n) => !Number.isInteger(n) || n < 1 || n > 31))
      )
        throw Error("Дни месяца недопустимы");
      if (e.actuals !== undefined) {
        if (!Array.isArray(e.actuals) || e.actuals.length > 730)
          throw Error("Слишком много фактических платежей");
        const seen = new Set();
        for (const fact of e.actuals) {
          if (
            !fact ||
            typeof fact !== "object" ||
            seen.has(fact.plannedDate) ||
            !Number.isSafeInteger(fact.cents) ||
            fact.cents < 0 ||
            fact.cents > MAX
          )
            throw Error("Некорректный фактический платёж");
          date(fact.plannedDate);
          date(fact.date);
          if (!occurrences(e, fact.plannedDate, fact.plannedDate).length)
            throw Error("Дата факта не соответствует повторению операции");
          seen.add(fact.plannedDate);
        }
      }
    }
    return {
      version: 1,
      start: x.start,
      balance: x.balance,
      events: x.events
        .map((e) => ({
          id: e.id,
          name: e.name.trim(),
          type: e.type,
          cents: e.cents,
          date: e.date,
          repeat: e.repeat ?? "once",
          confidence: e.confidence ?? "confirmed",
          category: e.category ?? "",
          paid: e.paid ?? false,
          ...(e.author !== undefined ? { author: e.author } : {}),
          ...(e.required !== undefined ? { required: e.required } : {}),
          ...(e.salary !== undefined ? { salary: e.salary } : {}),
          ...(e.actuals !== undefined
            ? {
                actuals: e.actuals
                  .map((f) => ({
                    plannedDate: f.plannedDate,
                    date: f.date,
                    cents: f.cents,
                  }))
                  .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)),
              }
            : {}),
          ...(e.end !== undefined ? { end: e.end } : {}),
          ...(e.days !== undefined
            ? { days: [...new Set(e.days)].sort((a, b) => a - b) }
            : {}),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
  function occurrences(e, start, end) {
    date(start);
    date(end);
    date(e.date);
    const out = [],
      repeat = e.repeat ?? "once",
      until = e.end && e.end < end ? e.end : end;
    if (until < start || e.date > until) return out;
    if (repeat === "once") return e.date >= start ? [e.date] : [];
    if (repeat === "weekly" || repeat === "biweekly") {
      const step = repeat === "weekly" ? 7 : 14;
      const offset =
        Math.max(0, Math.ceil((date(start) - date(e.date)) / DAY / step)) *
        step;
      let d = shift(e.date, offset);
      while (d <= until) {
        out.push(d);
        if ((date(until) - date(d)) / DAY < step) break;
        d = shift(d, step);
      }
    } else if (repeat === "monthly" || repeat === "twice") {
      const [y, m] = e.date.split("-").map(Number),
        [sy, sm] = start.split("-").map(Number),
        [ey, em] = until.split("-").map(Number);
      for (
        let i = Math.max(0, (sy - y) * 12 + sm - m);
        i <= (ey - y) * 12 + em - m;
        i++
      ) {
        if (repeat === "monthly") {
          const d = monthShift(e.date, i);
          if (d >= start && d <= until) out.push(d);
        } else {
          const first = monthShift(e.date.slice(0, 7) + "-01", i);
          const last = new Date(
            Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0),
          ).getUTCDate();
          for (const day of e.days ?? [10, 25]) {
            const d =
              first.slice(0, 7) +
              "-" +
              String(Math.min(day, last)).padStart(2, "0");
            if (d >= e.date && d >= start && d <= until) out.push(d);
          }
        }
      }
    } else throw Error("Неверное повторение");
    return [...new Set(out)].sort();
  }
  function add(a, b) {
    const result = a + b;
    if (!Number.isSafeInteger(result))
      throw Error("Итоговая сумма превышает точность расчёта");
    return result;
  }
  function project(data, horizon = 30, scenario = "base", extras = []) {
    data = valid(data);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 730)
      throw Error("Горизонт 1–730 дней");
    if (!["base", "conservative"].includes(scenario))
      throw Error("Неверный сценарий");
    const start = data.start,
      end = shift(start, horizon - 1),
      events = [];
    const all = valid({ ...data, events: [...data.events, ...extras] }).events;
    for (const e of all) {
      if (e.paid) continue;
      const facts = new Map((e.actuals || []).map((f) => [f.plannedDate, f]));
      for (const f of facts.values()) {
        if (f.date >= start && f.date <= end)
          events.push({
            ...e,
            date: f.date,
            cents: f.cents,
            plannedCents: e.cents,
            plannedDate: f.plannedDate,
            actual: true,
            sourceId: e.id,
          });
      }
      if (
        scenario === "conservative" &&
        e.type === "income" &&
        e.confidence === "expected"
      )
        continue;
      for (const d of occurrences(e, start, end))
        if (!facts.has(d))
          events.push({
            ...e,
            date: d,
            plannedDate: d,
            plannedCents: e.cents,
            actual: false,
            sourceId: e.id,
          });
    }
    events.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    let bal = data.balance,
      min = bal,
      minimumDate = start,
      firstNegative = bal < 0 ? start : null;
    let daysNegative = 0,
      longest = 0,
      streak = 0,
      p = 0;
    const daily = [];
    for (let i = 0; i < horizon; i++) {
      const d = shift(start, i),
        opening = bal,
        items = [];
      while (p < events.length && events[p].date === d) {
        const e = events[p++];
        if (e.type !== "transfer")
          bal = add(
            bal,
            (e.type === "income" || e.type === "borrow" ? 1 : -1) * e.cents,
          );
        items.push(e);
      }
      if (bal < min) {
        min = bal;
        minimumDate = d;
      }
      if (bal < 0) {
        firstNegative ??= d;
        daysNegative++;
        longest = Math.max(longest, ++streak);
      } else streak = 0;
      daily.push({
        date: d,
        opening,
        closing: bal,
        events: items,
        income: items
          .filter((e) => e.type === "income")
          .reduce((s, e) => add(s, e.cents), 0),
        expense: items
          .filter((e) => e.type === "expense" || e.type === "repay")
          .reduce((s, e) => add(s, e.cents), 0),
      });
    }
    return {
      start,
      end,
      daily,
      events,
      min,
      minimumDate,
      firstNegative,
      daysNegative,
      longest,
      needed: Math.max(0, -min),
      final: bal,
    };
  }
  function loan(principal, annualBp, months, kind = "annuity", extra = 0) {
    if (
      !Number.isSafeInteger(principal) ||
      principal < 0 ||
      principal > MAX ||
      !Number.isInteger(annualBp) ||
      annualBp < 0 ||
      annualBp > 100000 ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 600 ||
      !Number.isSafeInteger(extra) ||
      extra < 0 ||
      extra > MAX ||
      !["annuity", "differentiated"].includes(kind)
    )
      throw Error("Некорректные параметры кредита");
    let bal = principal,
      total = 0,
      interestTotal = 0;
    const schedule = [],
      r = annualBp / 120000;
    const target =
      r === 0
        ? principal / months
        : (principal * r) / -Math.expm1(-months * Math.log1p(r));
    for (let i = 1; i <= months && bal > 0; i++) {
      const interest = Math.round(bal * r);
      const base =
        kind === "differentiated"
          ? Math.round(principal / months)
          : Math.round(target) - interest;
      const part =
          i === months ? bal : Math.min(bal, Math.max(0, base) + extra),
        pay = add(part, interest);
      bal -= part;
      total = add(total, pay);
      interestTotal = add(interestTotal, interest);
      schedule.push({
        month: i,
        interest,
        principal: part,
        payment: pay,
        balance: bal,
      });
    }
    return {
      schedule,
      total,
      interest: interestTotal,
      remaining: bal,
      monthly: schedule[0]?.payment || 0,
    };
  }
  function undo(data, entry) {
    data = valid(data);
    if (entry.event_id === null) {
      if (
        JSON.stringify([data.start, data.balance]) !==
        JSON.stringify([entry.after.start, entry.after.balance])
      )
        throw Error(
          "Остаток или дата изменились после этой записи. Отмена остановлена.",
        );
      return valid({ ...data, ...entry.before });
    }
    const current = data.events.find((e) => e.id === entry.event_id) || null;
    const canonical = (e) =>
      e ? valid({ ...data, events: [e] }).events[0] : null;
    if (
      JSON.stringify(canonical(current)) !==
      JSON.stringify(canonical(entry.after))
    )
      throw Error(
        "Операция уже изменилась. Отмена остановлена, чтобы сохранить новые правки.",
      );
    return valid({
      ...data,
      events: [
        ...data.events.filter((e) => e.id !== entry.event_id),
        ...(entry.before ? [entry.before] : []),
      ],
    });
  }
  function balanceNow(data, asOf) {
    data = valid(data);
    date(asOf);
    if (asOf < data.start)
      return {
        balance: null,
        received: 0,
        spent: 0,
        events: [],
        date: asOf,
        start: data.start,
      };
    let balance = data.balance,
      received = 0,
      spent = 0;
    const events = [];
    for (const e of data.events) {
      if (e.paid || e.type === "transfer") continue;
      for (const f of e.actuals || []) {
        if (f.date < data.start || f.date > asOf) continue;
        if (["income", "borrow"].includes(e.type)) {
          received = add(received, f.cents);
          balance = add(balance, f.cents);
        } else {
          spent = add(spent, f.cents);
          balance = add(balance, -f.cents);
        }
        events.push({ ...e, ...f, actual: true, sourceId: e.id });
      }
    }
    events.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    return { balance, received, spent, events, date: asOf, start: data.start };
  }
  function obligations(data, asOf) {
    data = valid(data);
    date(asOf);
    const from = asOf < data.start ? data.start : asOf;
    const offset = Math.round((date(from) - date(data.start)) / DAY);
    if (offset > 699)
      throw Error(
        "Обновите дату и остаток в настройках: дата отсчёта слишком далеко от сегодняшней.",
      );
    const p = project(data, Math.min(730, offset + 366));
    const nextIncome = p.events.find(
      (e) =>
        e.date >= from &&
        !e.actual &&
        e.type === "income" &&
        (e.salary ?? true),
    );
    const until = nextIncome?.date || shift(from, 29);
    const items = p.events.filter(
      (e) =>
        !e.actual &&
        e.date >= from &&
        e.date <= until &&
        ["expense", "repay"].includes(e.type) &&
        (e.required ?? true),
    );
    const reserve = items.reduce((n, e) => add(n, e.cents), 0);
    const current = balanceNow(data, from).balance;
    const free = add(current, -reserve);
    return {
      from,
      until,
      nextIncome,
      items,
      reserve,
      current,
      available: Math.max(0, free),
      shortfall: Math.max(0, -free),
    };
  }
  return {
    money,
    amount,
    date,
    shift,
    monthShift,
    valid,
    occurrences,
    project,
    obligations,
    balanceNow,
    undo,
    loan,
  };
});
