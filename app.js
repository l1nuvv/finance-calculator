(() => {
  "use strict";
  const E = FinEngine,
    $ = (id) => document.getElementById(id),
    STORE = "kontur:budget:v1";
  let storageOK = true,
    readBlocked = false,
    corruptRaw = null,
    shared = null,
    editingEvent = null;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const empty = () => ({ version: 1, start: today(), balance: 0, events: [] });
  let state = empty(),
    horizon = 30,
    scenario = "base",
    current = null;
  function load() {
    try {
      const v = localStorage.getItem(STORE);
      if (v) state = E.valid(JSON.parse(v));
      storageOK = true;
      readBlocked = false;
      corruptRaw = null;
    } catch (e) {
      storageOK = false;
      readBlocked = true;
      try {
        corruptRaw = localStorage.getItem(STORE);
      } catch {}
      $("saved").textContent = "Ошибка чтения · исходная копия сохранена";
    }
  }
  function persist() {
    if (shared?.active) {
      shared.changed();
      storageMsg();
      return;
    }
    if (readBlocked)
      throw Error(
        "Сначала скачайте исходную копию и восстановите данные через импорт или очистку.",
      );
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      $("saved").textContent = "Сохранено на этом устройстве";
      $("saved").classList.remove("error");
      storageOK = true;
    } catch (e) {
      storageOK = false;
      $("saved").textContent = "Не удалось сохранить: экспортируйте JSON";
    }
    storageMsg();
  }
  function commit(next, recovering = false) {
    if (readBlocked && !shared?.active && !recovering)
      throw Error(
        "Локальные данные повреждены. Скачайте исходную копию в настройках и восстановите через импорт.",
      );
    const checked = E.valid(next);
    E.project(checked, horizon, scenario);
    state = checked;
    if (recovering) {
      readBlocked = false;
      corruptRaw = null;
    }
    persist();
    sync();
    draw();
  }
  function storageMsg() {
    $("export-corrupt").hidden = !corruptRaw;
    $("storage-warning").textContent =
      readBlocked && !shared?.active
        ? "Исходные данные не прочитаны и защищены от перезаписи. Скачайте их для восстановления."
        : storageOK
          ? "Копия в браузере не шифруется. На общедоступном устройстве выйдите из аккаунта. Храните резервные копии отдельно."
          : "Браузер не подтвердил локальное сохранение. Экспортируйте JSON.";
  }
  function escape(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function fmt(n) {
    return E.amount(n);
  }
  function labelDate(d) {
    return new Date(d + "T12:00:00Z").toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  function category(e) {
    return escape(
      e.category ||
        {
          income: "Доход",
          expense: "Расход",
          borrow: "Заём",
          repay: "Возврат долга",
          transfer: "Перевод",
        }[e.type] ||
        "",
    );
  }
  function sign(e) {
    if (e.type === "transfer") return "";
    return e.type === "income" || e.type === "borrow" ? "+" : "−";
  }
  function recalculation() {
    try {
      current = E.project(state, horizon, scenario);
      return current;
    } catch (e) {
      alert("Ошибка прогноза: " + e.message);
      return null;
    }
  }
  function chart(days) {
    const w = 800,
      h = 250,
      l = 66,
      r = 16,
      t = 16,
      b = 35,
      vals = [0, ...days.map((x) => x.closing)],
      min = Math.min(...vals),
      max = Math.max(...vals),
      pad = Math.max(100, Math.round((max - min) * 0.1)),
      lower = min - pad,
      upper = max + pad,
      x = (i) => l + (i * (w - l - r)) / Math.max(1, days.length - 1),
      y = (v) => t + ((upper - v) / (upper - lower)) * (h - t - b);
    const coords = days
      .map((d, i) => `${x(i).toFixed(2)},${y(d.closing).toFixed(2)}`)
      .join(" ");
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const v = lower + ((upper - lower) * i) / 4,
        pos = y(v);
      grid += `<line x1="${l}" x2="${w - r}" y1="${pos}" y2="${pos}" stroke="#e4ebe8"/><text x="${l - 7}" y="${pos + 4}" text-anchor="end" font-size="12" fill="#8ba09d">${Math.round(v / 100).toLocaleString("ru-RU")}</text>`;
    }
    const zero = y(0);
    const a = days[0],
      z = days[days.length - 1];
    $("chart").innerHTML =
      `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Прогноз от ${labelDate(a.date)} до ${labelDate(z.date)}"><rect x="${l}" y="${zero}" width="${w - l - r}" height="${Math.max(0, h - b - zero)}" fill="#fff2ed"/>${grid}<line x1="${l}" x2="${w - r}" y1="${zero}" y2="${zero}" stroke="#cba79c" stroke-dasharray="4 4"/><polyline points="${coords}" fill="none" stroke="#277c6c" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><text x="${l}" y="${h - 6}" font-size="12" fill="#8ba09d">${labelDate(a.date)}</text><text x="${w - r}" y="${h - 6}" font-size="12" fill="#8ba09d" text-anchor="end">${labelDate(z.date)}</text></svg>`;
  }
  function overview() {
    const p = recalculation();
    if (!p) return;
    $("current").textContent = fmt(state.balance);
    $("minimum").textContent = fmt(p.min);
    $("minimum").classList.toggle("negative", p.min < 0);
    $("min-date").textContent = "Минимум: " + labelDate(p.minimumDate);
    $("ending").textContent = fmt(p.final);
    $("end-date").textContent = "На " + labelDate(p.end);
    $("needed").textContent = fmt(p.needed);
    $("needed").classList.toggle("negative", p.needed > 0);
    $("gap-date").textContent = p.firstNegative
      ? "Первый дефицит: " + labelDate(p.firstNegative)
      : "Разрывов не обнаружено";
    $("notice").className = "notice" + (p.needed ? " risk" : "");
    $("notice").textContent = p.needed
      ? `Прогнозируется недостаток средств ${fmt(p.needed)}. Первый отрицательный дневной остаток — ${labelDate(p.firstNegative)}. Дней с дефицитом: ${p.daysNegative}. Для предотвращения всех отрицательных дневных остатков потребуется дополнительно ${fmt(p.needed)} до возникновения дефицита (если остальные операции не изменятся).`
      : `По известным операциям на следующие ${horizon} дней отрицательного дневного остатка нет. Неучтённые расходы и задержки доходов могут изменить результат.`;
    chart(p.daily);
    let arr = p.events.filter((e) => e.type !== "transfer").slice(0, 8);
    $("up-count").textContent = String(p.events.length) + " событий";
    $("upcoming").innerHTML = arr.length
      ? arr
          .map(
            (e) =>
              `<div class="entry"><div><div class="entry-title">${escape(e.name)}</div><div class="entry-note">${labelDate(e.date)} · ${category(e)} · ${authorLabel(e)}</div></div><div class="entry-value ${sign(e) === "+" ? "positive" : ""}">${sign(e)}${fmt(e.cents)}</div></div>`,
          )
          .join("")
      : '<div class="empty">Добавьте ближайшую зарплату или платёж.</div>';
  }
  function authorLabel(e) {
    return e.author ? "Добавил(а): " + escape(e.author) : "Автор не указан";
  }
  function operations() {
    const query = $("search-ops").value.trim().toLocaleLowerCase("ru-RU"),
      filter = $("filter-ops").value;
    const list = state.events
      .filter(
        (e) =>
          (filter === "all" || e.type === filter) &&
          (!query ||
            (e.name + " " + (e.category || "") + " " + (e.author || ""))
              .toLocaleLowerCase("ru-RU")
              .includes(query)),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    $("ops").innerHTML = list.length
      ? list
          .map(
            (e) =>
              `<div class="entry"><div><div class="entry-title">${escape(e.name)}</div><div class="entry-note">${labelDate(e.date)} · ${category(e)} · ${e.repeat === "once" ? "разовая" : "повторяется"} ${e.paid ? "· уже учтена" : ""} · ${authorLabel(e)}</div></div><div class="entry-actions"><b class="entry-value ${sign(e) === "+" ? "positive" : ""}">${sign(e)}${fmt(e.cents)}</b><button data-edit="${escape(e.id)}">Изменить</button><button data-delete="${escape(e.id)}" aria-label="Удалить ${escape(e.name)}">×</button></div></div>`,
          )
          .join("")
      : '<div class="empty">Операций пока нет. Нажмите «+ Операция».</div>';
  }
  function calendar() {
    const p = recalculation();
    if (!p) return;
    $("days").innerHTML = p.daily
      .map(
        (x) =>
          `<div class="day"><button data-date="${x.date}"><span>${labelDate(x.date)}</span><span>${x.events.length ? x.events.length + " опер." : "Без операций"}</span><b class="${x.closing < 0 ? "negative" : ""}">${fmt(x.closing)}</b></button><div class="detail" data-detail="${x.date}" hidden>${x.events.map((e) => `<p>${escape(e.name)} · ${sign(e)}${fmt(e.cents)} · ${authorLabel(e)}</p>`).join("") || "<p>На этот день операций нет.</p>"}<button data-newdate="${x.date}">+ Добавить сюда</button></div></div>`,
      )
      .join("");
  }
  function debt() {
    const debtEvents = state.events.filter(
      (e) => e.type === "borrow" || e.type === "repay",
    );
    const owed =
      debtEvents
        .filter((e) => e.type === "borrow")
        .reduce((a, e) => a + e.cents, 0) -
      debtEvents
        .filter((e) => e.type === "repay")
        .reduce((a, e) => a + e.cents, 0);
    $("debt-summary").innerHTML =
      `<p>Разница запланированных поступлений займов и возвратов: <strong>${fmt(owed)}</strong>.</p><p class="footnote">Это НЕ фактическая задолженность: без отдельных записей о прошлых операциях нельзя достоверно вычислить текущий долг. Не путайте заём с доходом.</p>`;
  }
  function draw() {
    const active =
      document.querySelector("nav button.selected")?.dataset.tab || "overview";
    if (active === "overview") overview();
    if (active === "operations") operations();
    if (active === "calendar") calendar();
    if (active === "debts") debt();
  }
  function tab(v) {
    document.querySelectorAll(".tab").forEach((n) => (n.hidden = n.id !== v));
    document
      .querySelectorAll("nav button")
      .forEach((n) => {
        const selected = n.dataset.tab === v;
        n.classList.toggle("selected", selected);
        if (selected) n.setAttribute("aria-current", "page");
        else n.removeAttribute("aria-current");
      });
    $("heading").textContent = {
      overview: "Обзор",
      operations: "Операции",
      calendar: "Календарь",
      debts: "Кредиты и долги",
      settings: "Данные и настройки",
    }[v];
    draw();
  }
  function openEvent(e = {}, specified) {
    editingEvent = e.id
      ? JSON.stringify(E.valid({ ...state, events: [e] }).events[0])
      : null;
    $("event-form").reset();
    $("error").textContent = "";
    $("event-id").value = e.id || "";
    $("dialog-title").textContent = e.id
      ? "Изменить операцию"
      : "Новая операция";
    $("event-name").value = e.name || "";
    $("event-type").value = e.type || "expense";
    $("event-amount").value =
      e.cents === undefined ? "" : (e.cents / 100).toFixed(2);
    $("event-date").value = e.date || specified || state.start;
    $("event-repeat").value = e.repeat || "once";
    $("event-end").value = e.end || "";
    $("event-confidence").value = e.confidence || "confirmed";
    $("event-category").value = e.category || "";
    $("event-paid").checked = !!e.paid;
    $("dialog").showModal();
  }
  function saveEvent(ev) {
    ev.preventDefault();
    try {
      const id = $("event-id").value || crypto.randomUUID(),
        e = {
          id,
          name: $("event-name").value.trim(),
          type: $("event-type").value,
          cents: E.money($("event-amount").value),
          date: $("event-date").value,
          repeat: $("event-repeat").value,
          confidence: $("event-confidence").value,
          category: $("event-category").value.trim(),
          paid: $("event-paid").checked,
        };
      if (!e.name) throw Error("Введите название");
      if (e.cents < 0) throw Error("Сумма должна быть неотрицательной");
      if ($("event-end").value) e.end = $("event-end").value;
      E.date(e.date);
      if (e.end && e.end < e.date) throw Error("Дата окончания раньше начала");
      const idx = state.events.findIndex((v) => v.id === id);
      if (
        editingEvent &&
        (idx < 0 || JSON.stringify(state.events[idx]) !== editingEvent)
      )
        throw Error(
          "Операция изменилась на другом устройстве. Закройте окно и откройте её заново.",
        );
      const events = state.events.slice();
      const author = idx >= 0
        ? state.events[idx].author
        : shared?.active ? shared.client.user.email.split("@")[0].toLowerCase() : undefined;
      if (author !== undefined) e.author = author;
      if (idx < 0) events.push(e);
      else events[idx] = e;
      commit({ ...state, events });
      $("dialog").close();
    } catch (e) {
      $("error").textContent = e.message;
    }
  }
  function comparison() {
    try {
      const cents = E.money($("what-amount").value),
        d = $("what-date").value,
        r = $("what-repay").value;
      E.date(d);
      E.date(r);
      if (cents < 0) throw Error("Сумма займа должна быть неотрицательной");
      if (r < d) throw Error("Возврат раньше получения");
      const extras = [
          {
            id: "preview-b",
            name: "Пробный заём",
            type: "borrow",
            cents,
            date: d,
            repeat: "once",
            confidence: "confirmed",
          },
          {
            id: "preview-r",
            name: "Пробный возврат",
            type: "repay",
            cents,
            date: r,
            repeat: "once",
            confidence: "confirmed",
          },
        ],
        base = E.project(state, horizon, scenario),
        alt = E.project(state, horizon, scenario, extras);
      $("comparison").innerHTML =
        `<div class="comp"><span>Без займа: минимум <strong>${fmt(base.min)}</strong></span><span>С займом: минимум <strong>${fmt(alt.min)}</strong></span><span>Необходимо покрыть: <strong>${fmt(alt.needed)}</strong></span><span>Остаток на ${labelDate(alt.end)}: <strong>${fmt(alt.final)}</strong></span></div><p class="footnote">Это пробный сценарий. Он не изменил основной бюджет. Заём не учитывается как заработанный доход.</p>`;
    } catch (e) {
      $("comparison").textContent = e.message;
    }
  }
  function loanCalc() {
    try {
      const p = E.money($("loan-p").value),
        r = E.money($("loan-r").value),
        n = Number($("loan-n").value),
        extra = E.money($("loan-extra").value);
      const x = E.loan(p, r, n, $("loan-type").value, extra);
      $("loan-result").innerHTML =
        `<div class="loanmetrics"><div>Первый платёж<strong>${fmt(x.monthly)}</strong></div><div>Переплата<strong>${fmt(x.interest)}</strong></div><div>Всего выплат<strong>${fmt(x.total)}</strong></div></div><div class="loanscroll"><table><thead><tr><th>Месяц</th><th>Платёж</th><th>Проценты</th><th>Остаток</th></tr></thead><tbody>${x.schedule.map((v) => `<tr><td>${v.month}</td><td>${fmt(v.payment)}</td><td>${fmt(v.interest)}</td><td>${fmt(v.balance)}</td></tr>`).join("")}</tbody></table></div>`;
    } catch (e) {
      $("loan-result").textContent = e.message;
    }
  }
  function bind() {
    document
      .querySelectorAll("nav button")
      .forEach((n) => n.addEventListener("click", () => tab(n.dataset.tab)));
    $("add").addEventListener("click", () => openEvent());
    $("close").onclick = $("cancel").onclick = () => $("dialog").close();
    $("event-form").addEventListener("submit", saveEvent);
    $("search-ops").oninput = operations;
    $("filter-ops").onchange = operations;
    $("period").onchange = (e) => {
      horizon = +e.target.value;
      draw();
    };
    $("scenario").onchange = (e) => {
      scenario = e.target.value;
      draw();
    };
    $("compare").onclick = comparison;
    $("loan-calc").onclick = loanCalc;
    $("apply").onclick = () => {
      try {
        commit({
          ...state,
          balance: E.money($("balance").value),
          start: $("setting-date").value,
        });
        $("saved").textContent = shared?.active
          ? "Остаток обновлён · синхронизация…"
          : "Начальный остаток обновлён";
      } catch (e) {
        alert(e.message);
      }
    };
    $("export").onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "kontur-backup-" + today() + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    $("export-corrupt").onclick = () => {
      const url = URL.createObjectURL(
        new Blob([corruptRaw], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "kontur-original.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    $("import").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (f.size > 2000000) throw Error("Файл слишком большой");
        const imported = E.valid(JSON.parse(await f.text()));
        if (
          !confirm(
            "Заменить текущие данные содержимым файла? Создайте резервную копию перед импортом.",
          )
        )
          return;
        commit(imported, true);
      } catch (err) {
        alert("Импорт отменён: " + err.message);
      } finally {
        e.target.value = "";
      }
    };
    $("reset").onclick = () => {
      if (
        confirm(
          "Удалить все операции и баланс в открытом бюджете? Если подключено облако, данные удалятся у обоих участников.",
        ) &&
        confirm("Точно удалить? Отменить действие невозможно.")
      ) {
        try {
          commit(empty(), true);
        } catch (e) {
          alert(e.message);
        }
      }
    };
    $("ops").onclick = (e) => {
      const b = e.target.closest("[data-edit],[data-delete]");
      if (!b) return;
      const id = b.dataset.edit || b.dataset.delete,
        item = state.events.find((x) => x.id === id);
      if (!item) return;
      if (b.dataset.edit) openEvent(item);
      else if (confirm("Удалить операцию «" + item.name + "»?")) {
        try {
          commit({ ...state, events: state.events.filter((x) => x.id !== id) });
        } catch (e) {
          alert(e.message);
        }
      }
    };
    $("days").onclick = (e) => {
      const b = e.target.closest("[data-date],[data-newdate]");
      if (!b) return;
      if (b.dataset.newdate) {
        openEvent({}, b.dataset.newdate);
        return;
      }
      const d = $("days").querySelector(
        '[data-detail="' + b.dataset.date + '"]',
      );
      d.hidden = !d.hidden;
    };
  }
  function sync() {
    $("start").value = state.start;
    if (document.activeElement !== $("balance"))
      $("balance").value = (state.balance / 100).toFixed(2);
    if (document.activeElement !== $("setting-date"))
      $("setting-date").value = state.start;
    $("what-date").value = state.start;
    $("what-repay").value = E.shift(state.start, Math.min(horizon - 1, 16));
    storageMsg();
  }
  load();
  bind();
  sync();
  tab("overview");
  shared = new SharedBudget({
    getData: () => state,
    onData: (data) => {
      state = E.valid(data);
      sync();
      draw();
    },
    onLocal: () => {
      state = empty();
      load();
      sync();
      draw();
      $("saved").textContent = "Локальный бюджет";
    },
  });
})();
