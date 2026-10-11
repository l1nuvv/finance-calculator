(() => {
  "use strict";
  const E = FinEngine,
    $ = (id) => document.getElementById(id),
    STORE = "kontur:budget:v1";
  let storageOK = true,
    readBlocked = false,
    corruptRaw = null,
    shared = null,
    editingEvent = null,
    localHistory = [],
    historyEpoch = 0;
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
      localHistory = JSON.parse(
        localStorage.getItem("kontur:history:v1") || "[]",
      );
      if (!Array.isArray(localHistory)) localHistory = [];
    } catch {
      localHistory = [];
    }
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
  function commit(next, recovering = false, undoOf = null) {
    if (readBlocked && !shared?.active && !recovering)
      throw Error(
        "Локальные данные повреждены. Скачайте исходную копию в настройках и восстановите через импорт.",
      );
    const checked = E.valid(next);
    E.project(checked, horizon, scenario);
    if (!shared?.active) {
      const changes = [];
      const before = new Map(state.events.map((e) => [e.id, e])),
        after = new Map(checked.events.map((e) => [e.id, e]));
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        const a = before.get(id) || null,
          b = after.get(id) || null;
        if (JSON.stringify(a) !== JSON.stringify(b))
          changes.push({
            event_id: id,
            before: a,
            after: b,
            action: !a ? "create" : !b ? "delete" : "update",
          });
      }
      if (state.start !== checked.start || state.balance !== checked.balance)
        changes.push({
          event_id: null,
          before: { start: state.start, balance: state.balance },
          after: { start: checked.start, balance: checked.balance },
          action: "snapshot",
        });
      localHistory = [
        ...changes.map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          actor: "На этом устройстве",
          undo_of: undoOf,
          created_at: new Date().toISOString(),
        })),
        ...localHistory,
      ].slice(0, 100);
      try {
        localStorage.setItem("kontur:history:v1", JSON.stringify(localHistory));
      } catch {}
    }
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
  let chartDate = null;
  function fullDate(d) {
    return new Date(d + "T12:00:00Z").toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  function chart(days) {
    const w = Math.max(240, $("chart").clientWidth),
      h = 260,
      l = 66,
      r = 18,
      t = 20,
      b = 36;
    const bounds = KonturChart.scale(days.map((d) => d.closing));
    const x = (i) => l + (i * (w - l - r)) / Math.max(1, days.length - 1);
    const y = (v) =>
      t + ((bounds.upper - v) / (bounds.upper - bounds.lower)) * (h - t - b);
    const index = Math.max(
      0,
      days.findIndex((d) => d.date === (chartDate || today())),
    );
    chartDate = days[index].date;
    const axis = new Intl.NumberFormat("ru-RU", {
      notation:
        Math.max(Math.abs(bounds.lower), Math.abs(bounds.upper)) >= 100000000
          ? "compact"
          : "standard",
      maximumFractionDigits: bounds.step < 100 ? 2 : 1,
    });
    const grid = bounds.ticks
      .map(
        (v) =>
          `<line class="chart-grid${v === 0 ? " chart-zero" : ""}" x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l - 9}" y="${y(v) + 4}" text-anchor="end" font-size="11">${axis.format(v / 100)}</text>`,
      )
      .join("");
    const dates = KonturChart.dates(days.length, w - l - r)
      .map(
        (i) =>
          `<line class="chart-date-grid" x1="${x(i)}" x2="${x(i)}" y1="${t}" y2="${h - b}"/><text x="${x(i)}" y="${h - 9}" font-size="11" text-anchor="${i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}">${labelDate(days[i].date)}</text>`,
      )
      .join("");
    const coords = days.map((d, i) => `${x(i)},${y(d.closing)}`).join(" ");
    const dots = days
      .map((d, i) =>
        d.events.length
          ? `<circle class="chart-event-dot" cx="${x(i)}" cy="${y(d.closing)}" r="3"/>`
          : "",
      )
      .join("");
    const zero = y(0);
    $("chart").innerHTML =
      `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Прогноз денег с ${fullDate(days[0].date)} по ${fullDate(days.at(-1).date)} Выберите день с помощью поля даты или ползунка под графиком.">${bounds.lower < 0 ? `<rect x="${l}" y="${zero}" width="${w - l - r}" height="${h - b - zero}"/>` : ""}${grid}${dates}<polyline points="${coords}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>${dots}<line id="chart-cursor" class="chart-cursor" x1="${x(index)}" x2="${x(index)}" y1="${t}" y2="${h - b}"/><circle id="chart-selected" class="chart-selected" cx="${x(index)}" cy="${y(days[index].closing)}" r="5"/></svg>`;
    const select = (i) => {
      if (chartDate === days[i].date) return;
      chartDate = days[i].date;
      $("chart-cursor").setAttribute("x1", x(i));
      $("chart-cursor").setAttribute("x2", x(i));
      $("chart-selected").setAttribute("cx", x(i));
      $("chart-selected").setAttribute("cy", y(days[i].closing));
      chartDetail(days, i);
    };
    const pointer = (e) => {
      const svg = $("chart").querySelector("svg"),
        rect = svg.getBoundingClientRect();
      select(
        KonturChart.nearest(
          ((e.clientX - rect.left) * w) / rect.width,
          l,
          w - r,
          days.length,
        ),
      );
    };
    $("chart").onpointerdown = pointer;
    $("chart").onpointermove = (e) => {
      if (e.pointerType === "mouse" && !e.buttons) pointer(e);
    };
    $("chart-day").max = days.length - 1;
    $("chart-day").oninput = (e) => select(Number(e.target.value));
    $("chart-date").min = days[0].date;
    $("chart-date").max = days.at(-1).date;
    $("chart-date").onchange = (e) => {
      const i = days.findIndex((d) => d.date === e.target.value);
      if (i >= 0) select(i);
      else e.target.value = chartDate;
    };
    $("chart-prev").onclick = () =>
      select(Math.max(0, days.findIndex((d) => d.date === chartDate) - 1));
    $("chart-next").onclick = () =>
      select(
        Math.min(
          days.length - 1,
          days.findIndex((d) => d.date === chartDate) + 1,
        ),
      );
    chartDetail(days, index);
  }
  function chartDetail(days, index) {
    const day = days[index];
    $("chart-day").value = index;
    $("chart-day").setAttribute(
      "aria-valuetext",
      `${fullDate(day.date)}: ${fmt(day.closing)}`,
    );
    $("chart-date").value = day.date;
    $("chart-prev").disabled = index === 0;
    $("chart-next").disabled = index === days.length - 1;
    $("chart-detail").innerHTML =
      `<div class="chart-day-heading"><div><strong>${fullDate(day.date)}</strong><span>После платежей этого дня</span></div><strong class="${day.closing < 0 ? "negative" : ""}">${fmt(day.closing)}</strong></div><div class="chart-day-opening">До платежей: ${fmt(day.opening)}</div>${day.events.length ? day.events.map((e) => `<div class="entry"><div><div class="entry-title">${escape(e.name)}</div><div class="entry-note">${e.actual ? "Уже произошло" : "Запланировано"} · ${category(e)}</div></div><span class="entry-value ${sign(e) === "+" ? "positive" : ""}">${sign(e)}${fmt(e.cents)}</span></div>`).join("") : '<p class="empty">На этот день платежей нет — сумма не меняется.</p>'}`;
  }
  function actualBalance() {
    try {
      const a = E.balanceNow(state, today());
      $("balance-now").textContent = a.balance === null ? "—" : fmt(a.balance);
      $("balance-now").classList.toggle(
        "negative",
        a.balance !== null && a.balance < 0,
      );
      $("balance-now-note").textContent =
        a.balance === null
          ? "Начальная дата ещё не наступила"
          : `На ${labelDate(a.date)} · только отмеченные платежи`;
      $("balance-calculation").innerHTML =
        a.balance === null
          ? `<p>Вы указали деньги на будущую дату ${fullDate(a.start)}. Для баланса на сегодня задайте начальную сумму и дату не позже сегодняшней.</p>`
          : `<div class="balance-equation"><div>На начало ${labelDate(a.start)}<strong>${fmt(state.balance)}</strong></div><div>Уже пришло<strong class="positive">${a.received ? "+" : ""}${fmt(a.received)}</strong></div><div>Уже потрачено<strong>${a.spent ? "−" : ""}${fmt(a.spent)}</strong></div><div>Баланс сейчас<strong>${fmt(a.balance)}</strong></div></div>${a.events.map((e) => `<div class="entry"><div>${escape(e.name)}<div class="entry-note">${labelDate(e.date)} · уже произошло</div></div><span class="entry-value">${sign(e)}${fmt(e.cents)}</span></div>`).join("")}`;
    } catch (e) {
      $("balance-now").textContent = "—";
      $("balance-now-note").textContent = "Проверьте данные";
      $("balance-calculation").textContent = e.message;
    }
  }

  let chartFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(chartFrame);
    chartFrame = requestAnimationFrame(() => {
      if (!$("overview").hidden && current) chart(current.daily);
    });
  });
  function overview() {
    const p = recalculation();
    if (!p) return;
    $("current").textContent = fmt(state.balance);
    actualBalance();
    $("minimum").textContent = fmt(p.min);
    $("minimum").classList.toggle("negative", p.min < 0);
    $("min-date").textContent = "Минимум: " + labelDate(p.minimumDate);
    $("ending").textContent = fmt(p.final);
    $("end-date").textContent = "На " + labelDate(p.end);
    $("needed").textContent = fmt(p.needed);
    $("needed").classList.toggle("negative", p.needed > 0);
    $("gap-date").textContent = p.firstNegative
      ? "Первый минус: " + labelDate(p.firstNegative)
      : "По плану денег хватает";
    $("notice").className = "notice" + (p.needed ? " risk" : "");
    $("notice").textContent = p.needed
      ? `По плану с ${labelDate(p.firstNegative)} не хватает денег. Нужно ещё ${fmt(p.needed)}, чтобы пройти весь период без минуса.`
      : `По плану на ${horizon} дней денег хватает. Проверьте, что добавили все расходы и доходы.`;
    chart(p.daily);
    obligations();
    let arr = p.events.filter((e) => e.type !== "transfer").slice(0, 8);
    $("up-count").textContent = String(p.events.length) + " событий";
    $("upcoming").innerHTML = arr.length
      ? arr
          .map(
            (e) =>
              `<div class="entry"><div><div class="entry-title">${escape(e.name)}</div><div class="entry-note">${labelDate(e.date)} · ${category(e)} · ${e.actual ? "уже произошло" : "запланировано"} · ${authorLabel(e)}</div></div><div class="entry-value ${sign(e) === "+" ? "positive" : ""}">${sign(e)}${fmt(e.cents)}</div></div>`,
          )
          .join("")
      : '<div class="empty">Добавьте ближайшую зарплату или платёж.</div>';
  }
  function authorLabel(e) {
    return e.author ? "Добавил(а): " + escape(e.author) : "Автор не указан";
  }
  function obligations() {
    try {
      const x = E.obligations(state, today());
      $("obligations-period").textContent = x.nextIncome
        ? "До основного дохода " + labelDate(x.until)
        : "На 30 дней · основной доход не указан";
      $("obligations-summary").innerHTML =
        `<div>Нужно оставить<strong>${fmt(x.reserve)}</strong></div><div>Остаётся после платежей<strong>${fmt(x.available)}</strong></div><div>Не хватает на платежи<strong class="${x.shortfall ? "negative" : ""}">${fmt(x.shortfall)}</strong></div>`;
      $("obligations-list").innerHTML =
        x.items
          .map(
            (e) =>
              `<div class="entry"><div>${escape(e.name)}<div class="entry-note">${labelDate(e.date)}</div></div><b>${fmt(e.cents)}</b></div>`,
          )
          .join("") ||
        '<p class="empty">Обязательных платежей в этом периоде нет.</p>';
    } catch (e) {
      $("obligations-summary").textContent = e.message;
      $("obligations-list").replaceChildren();
    }
  }
  function planFact(e) {
    const facts = e.actuals || [];
    if (e.paid) return "Учтено в начальной сумме";
    if (e.repeat === "once" && facts.length)
      return `Уже произошло: ${fmt(facts[0].cents)} · ${labelDate(facts[0].date)}`;
    return `Запланировано: ${fmt(e.cents)}${facts.length ? " · Уже произошло: " + facts.map((f) => `${fmt(f.cents)} (${labelDate(f.date)})`).join("; ") : ""}`;
  }
  function displayedPayment(e) {
    return e.repeat === "once" ? e.actuals?.[0] || e : e;
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
      .sort((a, b) => displayedPayment(a).date.localeCompare(displayedPayment(b).date));
    $("ops").innerHTML = list.length
      ? list
          .map(
            (e) =>
              `<div class="entry"><div><div class="entry-title">${escape(e.name)}</div><div class="entry-note">${labelDate(displayedPayment(e).date)} · ${category(e)} · ${e.repeat === "once" ? "разовая" : "повторяется"} ${e.paid ? "· уже учтена" : ""} · ${authorLabel(e)}${["expense", "repay"].includes(e.type) && (e.required ?? true) ? " · обязательный" : ""}</div><div class="entry-note">${planFact(e)}</div></div><div class="entry-actions"><b class="entry-value ${sign(e) === "+" ? "positive" : ""}">${sign(e)}${fmt(displayedPayment(e).cents)}</b><button data-edit="${escape(e.id)}">Изменить</button><button data-delete="${escape(e.id)}" aria-label="Удалить ${escape(e.name)}">×</button></div></div>`,
          )
          .join("")
      : query || filter !== "all"
        ? '<div class="empty">Ничего не найдено. Измените поиск или выберите другой тип.</div>'
        : '<div class="empty">Операций пока нет. Нажмите «+ Операция».</div>';
  }
  function calendar() {
    const p = recalculation();
    if (!p) return;
    $("days").innerHTML = p.daily
      .map(
        (x) =>
          `<div class="day"><button data-date="${x.date}"><span>${labelDate(x.date)}</span><span>${x.events.length ? x.events.length + " опер." : "Без операций"}</span><b class="${x.closing < 0 ? "negative" : ""}">${fmt(x.closing)}</b></button><div class="detail" data-detail="${x.date}" hidden>${x.events.map((e) => `<p>${escape(e.name)} · ${sign(e)}${fmt(e.cents)} · ${e.actual ? "уже произошло" : "запланировано"} · ${authorLabel(e)}</p>`).join("") || "<p>На этот день операций нет.</p>"}<button data-newdate="${x.date}">+ Добавить сюда</button></div></div>`,
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
    if (active === "history") history();
  }
  function tab(v) {
    document.querySelectorAll(".tab").forEach((n) => (n.hidden = n.id !== v));
    document.querySelectorAll("nav button").forEach((n) => {
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
      history: "История изменений",
      help: "Помощь",
      settings: "Данные и настройки",
      account: shared?.client.user ? "Аккаунт и общий бюджет" : "Вход в аккаунт",
    }[v];
    $("add").hidden = v === "account";
    $("saved").hidden = v === "account";
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
    const payment = e.repeat === "once" ? e.actuals?.[0] : null;
    $("event-amount").value =
      e.cents === undefined ? "" : ((payment?.cents ?? e.cents) / 100).toFixed(2);
    $("event-date").value = payment?.date || e.date || specified || today();
    $("event-repeat").value = e.repeat || "once";
    $("event-end").value = e.end || "";
    $("event-confidence").value = e.confidence || "confirmed";
    $("event-category").value = e.category || "";
    $("event-paid").checked = !!e.paid;
    $("event-required").checked =
      e.required ?? ["expense", "repay"].includes(e.type || "expense");
    $("event-salary").checked = e.salary ?? e.type === "income";
    $("event-status").value = e.id
      ? payment
        ? "actual"
        : "planned"
      : $("event-date").value <= today()
        ? "actual"
        : "planned";
    $("event-payment-planned").value = e.id
      ? paymentDate(e)
      : $("event-date").value;
    fillPayment();
    $("event-payment-records").innerHTML = (e.actuals || [])
      .map((f) => `<div class="entry"><button type="button" data-payment-date="${f.plannedDate}">Платёж за ${labelDate(f.plannedDate)}</button><span>${fmt(f.cents)} · ${labelDate(f.date)}</span></div>`)
      .join("");
    $("dialog").showModal();
  }
  function paymentDate(item) {
    const day = today();
    const dates = E.occurrences(
      item,
      item.date > state.start ? item.date : state.start,
      E.shift(day > state.start ? day : state.start, 729),
    );
    const unpaid = dates.filter(
      (d) => !(item.actuals || []).some((f) => f.plannedDate === d),
    );
    return unpaid.find((d) => d <= day) || unpaid[0] || item.actuals?.at(-1)?.plannedDate || item.date;
  }
  function paymentVisibility() {
    const repeating = $("event-repeat").value !== "once";
    $("event-payment").hidden = !repeating;
    $("event-payment-values").hidden = !repeating || $("event-status").value !== "actual";
    for (const id of ["event-payment-date", "event-payment-amount"])
      $(id).required = !$("event-payment-values").hidden;
    $("event-payment-planned").required = repeating;
  }
  function resetPaymentDate() {
    const date = $("event-date").value;
    const previous = editingEvent ? JSON.parse(editingEvent) : null;
    const item = {
      date,
      repeat: $("event-repeat").value,
      ...(previous?.days ? { days: previous.days } : {}),
    };
    $("event-payment-planned").value = date
      ? E.occurrences(item, date, E.shift(date, 31))[0] || date
      : "";
    fillPayment();
  }
  function fillPayment() {
    const item = editingEvent ? JSON.parse(editingEvent) : null;
    const payment = item?.actuals?.find(
      (f) => f.plannedDate === $("event-payment-planned").value,
    );
    if (item && $("event-repeat").value !== "once")
      $("event-status").value = payment ? "actual" : "planned";
    $("event-payment-date").value = payment?.date || today();
    $("event-payment-amount").value = payment
      ? (payment.cents / 100).toFixed(2)
      : $("event-amount").value;
    paymentVisibility();
  }
  function changePaymentStatus() {
    if (editingEvent && $("event-repeat").value === "once") {
      const item = JSON.parse(editingEvent);
      const actual = $("event-status").value === "actual";
      const payment = actual ? item.actuals?.[0] : null;
      $("event-date").value = actual ? payment?.date || today() : item.date;
      $("event-amount").value = ((payment?.cents ?? item.cents) / 100).toFixed(2);
    }
    paymentVisibility();
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
          required: $("event-required").checked,
          salary: $("event-salary").checked,
        };
      if (!e.name) throw Error("Введите название");
      if (e.cents < 0) throw Error("Сумма должна быть неотрицательной");
      if ($("event-end").value) e.end = $("event-end").value;
      E.date(e.date);
      const idx = state.events.findIndex((v) => v.id === id);
      if (
        editingEvent &&
        (idx < 0 || JSON.stringify(state.events[idx]) !== editingEvent)
      )
        throw Error(
          "Операция изменилась на другом устройстве. Закройте окно и откройте её заново.",
        );
      const events = state.events.slice();
      const author =
        idx >= 0
          ? state.events[idx].author
          : shared?.active
            ? shared.client.user.email.split("@")[0].toLowerCase()
            : undefined;
      if (author !== undefined) e.author = author;
      if (idx >= 0 && state.events[idx].actuals)
        e.actuals = state.events[idx].actuals;
      if (idx >= 0 && e.repeat === "twice" && state.events[idx].days)
        e.days = state.events[idx].days;
      const occurred = $("event-status").value === "actual";
      if (e.repeat === "once") {
        const previous = idx >= 0 ? state.events[idx] : null;
        const date = e.date, cents = e.cents;
        // Keep the original plan; the completed payment replaces it in calculations.
        if (occurred && previous?.repeat === "once") {
          e.date = previous.date;
          e.cents = previous.cents;
        }
        e.actuals = occurred ? [{ plannedDate: e.date, date, cents }] : [];
      } else {
        const plannedDate = $("event-payment-planned").value;
        e.actuals = (e.actuals || []).filter((f) => f.plannedDate !== plannedDate);
        if (occurred)
          e.actuals.push({
            plannedDate,
            date: $("event-payment-date").value,
            cents: E.money($("event-payment-amount").value),
          });
      }
      if (e.end && e.end < e.date) throw Error("Дата окончания раньше начала");
      if (occurred && (e.repeat === "once" ? $("event-date").value : $("event-payment-date").value) > today())
        throw Error("Для будущей даты выберите «Запланировано». Деньги ещё не пришли и не потрачены.");
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
  async function history() {
    const epoch = ++historyEpoch,
      scope = shared?.active ? shared.cacheKey : "local";
    $("history-list").replaceChildren();
    $("history-status").textContent = "Загрузка истории…";
    try {
      const entries = shared?.active
        ? await shared.client.history()
        : localHistory;
      if (
        epoch !== historyEpoch ||
        scope !== (shared?.active ? shared.cacheKey : "local")
      )
        return;
      $("history-status").textContent = shared?.active
        ? "Общая история · сохранённые изменения"
        : "История на этом устройстве";
      $("history-list").innerHTML =
        entries
          .map((e) => {
            const label =
              {
                create: "Добавлена операция",
                update: "Изменена операция",
                delete: "Удалена операция",
                snapshot: "Изменён остаток / дата",
              }[e.action] || "Изменение";
            const describe = (value) =>
              !value
                ? "Нет записи"
                : e.event_id === null
                  ? `${fmt(value.balance)} · ${labelDate(value.start)}`
                  : `${escape(value.name)} · ${planFact(value)} · ${labelDate(value.date)} · ${category(value)} · ${escape(value.repeat || "once")} · ${value.paid ? "учтена в остатке" : "в расчёте"} · ${value.required === false ? "необязательная" : "обязательность по типу"}`;
            return `<div class="entry history-entry"><div><div class="entry-title">${e.undo_of ? "Отмена: " : ""}${label}</div><div class="entry-note">${escape(e.actor)} · ${escape(new Date(e.created_at).toLocaleString("ru-RU"))}</div><div class="entry-note">Было: ${describe(e.before)}</div><div class="entry-note">Стало: ${describe(e.after)}</div></div><button data-undo="${escape(e.id)}">Отменить</button></div>`;
          })
          .join("") ||
        '<p class="empty">История пока пуста. Новые изменения появятся здесь.</p>';
      $("history-list").onclick = async (event) => {
        const button = event.target.closest("[data-undo]");
        if (!button) return;
        const entry = entries.find((e) => e.id === button.dataset.undo);
        try {
          if (scope !== (shared?.active ? shared.cacheKey : "local"))
            throw Error("Бюджет изменился. Обновите историю.");
          if (shared?.active) {
            if (shared.busy || shared.dirty() || shared.conflicts.length)
              throw Error("Сначала дождитесь синхронизации текущих изменений.");
            await shared.run(async () => {
              const result = await shared.client.undo(
                entry.id,
                shared.revision,
              );
              if (!(await shared.reconcile(result.budget))) return;
              if (!result.saved)
                throw Error(
                  "Бюджет изменился на другом устройстве. Проверьте историю и повторите отмену.",
                );
              shared.status("Изменение отменено · синхронизировано");
            });
          } else commit(E.undo(state, entry), false, entry.id);
          await history();
        } catch (e) {
          $("history-status").textContent = e.message;
        }
      };
    } catch (e) {
      if (epoch === historyEpoch)
        $("history-status").textContent =
          "Не удалось загрузить историю: " + e.message;
    }
  }
  function themeLabel() {
    const dark = document.documentElement.dataset.theme === "dark";
    $("theme-toggle").textContent = dark ? "Светлая тема" : "Тёмная тема";
    $("theme-toggle").setAttribute("aria-pressed", String(dark));
  }
  function bind() {
    themeLabel();
    $("theme-toggle").onclick = () => {
      const theme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("kontur:theme", theme);
      } catch {}
      themeLabel();
    };
    $("history-refresh").onclick = history;
    $("event-status").onchange = changePaymentStatus;
    $("event-payment-planned").onchange = fillPayment;
    $("event-repeat").onchange = () => {
      resetPaymentDate();
    };
    $("event-date").onchange = () => {
      if (!editingEvent) {
        $("event-status").value = $("event-date").value <= today() ? "actual" : "planned";
        resetPaymentDate();
      }
    };
    $("event-amount").oninput = () => {
      if (!editingEvent) $("event-payment-amount").value = $("event-amount").value;
    };
    $("event-payment-records").onclick = (event) => {
      const button = event.target.closest("[data-payment-date]");
      if (button) {
        $("event-payment-planned").value = button.dataset.paymentDate;
        fillPayment();
      }
    };
    $("event-type").onchange = () => {
      $("event-required").checked = ["expense", "repay"].includes(
        $("event-type").value,
      );
      $("event-salary").checked = $("event-type").value === "income";
    };
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
        confirm(
          "Точно очистить открытый бюджет? Изменения будут записаны в историю.",
        )
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
      else if (b.dataset.edit) openEvent(item);
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
  tab("account");
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
    onAccount: ({ signedIn, active, connected, busy, lostSession }) => {
      const accountOpen = !$("account").hidden;
      if (lostSession) tab("account");
      else if (accountOpen && connected) tab("overview");
      if (!$("account").hidden)
        $("heading").textContent = signedIn
          ? busy && !active
            ? "Открываем общий бюджет…"
            : "Аккаунт и общий бюджет"
          : "Вход в аккаунт";
    },
  });
})();
