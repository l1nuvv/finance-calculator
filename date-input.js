(function (root) {
  "use strict";
  const format = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
  function parse(text) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
    if (!match) return "";
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const day = new Date(iso + "T12:00:00Z");
    return match[3] !== "0000" && !Number.isNaN(+day) && day.toISOString().slice(0, 10) === iso ? iso : "";
  }
  if (typeof module === "object" && module.exports) {
    module.exports = { format, parse };
    return;
  }
  const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  document.querySelectorAll('input[type="date"]').forEach(input => {
    let iso = input.value, view;
    input.type = "text";
    input.placeholder = "ДД/ММ/ГГГГ";
    input.inputMode = "numeric";
    input.maxLength = 10;
    input.autocomplete = "off";
    const hint = document.createElement("span");
    hint.id = input.id + "-format";
    hint.className = "visually-hidden";
    hint.textContent = "Дата в формате день, месяц, год. Например, 12/10/2026.";
    input.setAttribute("aria-describedby", hint.id);
    const wrapper = document.createElement("span");
    wrapper.className = "date-field";
    input.before(wrapper);
    wrapper.append(input, hint);
    function validate() {
      const text = nativeValue.get.call(input);
      const error = text && !iso ? "Введите существующую дату в формате ДД/ММ/ГГГГ." :
        iso && input.min && iso < input.min ? "Выберите дату не раньше " + format(input.min) + "." :
        iso && input.max && iso > input.max ? "Выберите дату не позже " + format(input.max) + "." : "";
      input.setCustomValidity(error);
      input.setAttribute("aria-invalid", String(!!error));
    }
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => iso,
      set(value) {
        iso = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : "";
        nativeValue.set.call(input, format(iso));
        validate();
      },
    });
    input.value = iso;
    input.addEventListener("input", () => {
      let text = nativeValue.get.call(input);
      if (/^\d{8}$/.test(text)) {
        text = text.slice(0, 2) + "/" + text.slice(2, 4) + "/" + text.slice(4);
        nativeValue.set.call(input, text);
      }
      iso = parse(text); validate();
    });
    input.addEventListener("change", () => { if (iso) nativeValue.set.call(input, format(iso)); validate(); });
    input.form?.addEventListener("reset", () => queueMicrotask(() => {
      iso = parse(nativeValue.get.call(input)); validate();
    }));
    if (input.readOnly) return;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "date-trigger";
    trigger.setAttribute("aria-label", "Открыть календарь");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></svg>';
    const popup = document.createElement("div");
    popup.className = "date-calendar";
    popup.id = input.id + "-calendar";
    popup.setAttribute("popover", "auto");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Выбор даты");
    trigger.setAttribute("aria-controls", popup.id);
    wrapper.append(trigger, popup);
    const makeButton = (text, action, name) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = text;
      if (name) b.setAttribute("aria-label", name);
      b.onclick = action; return b;
    };
    const allowed = value => (!input.min || value >= input.min) && (!input.max || value <= input.max);
    function choose(value) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      popup.hidePopover(); input.focus();
    }
    function position() {
      const r = input.getBoundingClientRect(), p = popup.getBoundingClientRect();
      popup.style.left = Math.max(12, Math.min(r.left, innerWidth - p.width - 12)) + "px";
      popup.style.top = Math.max(12, r.bottom + p.height + 8 <= innerHeight ? r.bottom + 8 : r.top - p.height - 8) + "px";
    }
    function render(focusDay) {
      popup.replaceChildren();
      const header = document.createElement("div"); header.className = "date-calendar-head";
      const changeMonth = delta => {
        const next = new Date(view); next.setUTCMonth(next.getUTCMonth() + delta, 1);
        if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
        view = next; render(); position();
      };
      const month = document.createElement("select");
      month.setAttribute("aria-label", "Месяц");
      months.forEach((name, i) => month.add(new Option(name, i)));
      month.value = view.getUTCMonth();
      month.onchange = () => { view.setUTCMonth(+month.value); render(); popup.querySelector("select").focus(); position(); };
      const year = document.createElement("input");
      year.type = "number"; year.min = 1; year.max = 9999;
      year.value = view.getUTCFullYear(); year.setAttribute("aria-label", "Год");
      year.onchange = () => {
        if (!year.checkValidity() || !year.value) return year.reportValidity();
        view.setUTCFullYear(+year.value); render(); popup.querySelector('input').focus(); position();
      };
      header.append(makeButton("‹", () => changeMonth(-1), "Предыдущий месяц"), month, year, makeButton("›", () => changeMonth(1), "Следующий месяц"));
      const grid = document.createElement("div"); grid.className = "date-calendar-grid";
      weekdays.forEach(name => { const s = document.createElement("span"); s.textContent = name; grid.append(s); });
      const offset = (view.getUTCDay() + 6) % 7;
      for (let i = 0; i < offset; i++) grid.append(document.createElement("span"));
      const monthEnd = new Date(view); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
      const count = monthEnd.getUTCDate();
      for (let day = 1; day <= count; day++) {
        const value = `${String(view.getUTCFullYear()).padStart(4, "0")}-${String(view.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const b = makeButton(String(day), () => choose(value), format(value));
        b.dataset.date = value; b.disabled = !allowed(value);
        b.classList.toggle("selected", iso === value);
        if (value === today()) b.setAttribute("aria-current", "date");
        b.tabIndex = value === (focusDay || iso || today()) ? 0 : -1;
        b.onkeydown = e => {
          const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((day + offset - 1) % 7), End: 6 - ((day + offset - 1) % 7) };
          if (!(e.key in deltas)) return;
          e.preventDefault();
          const next = new Date(value + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + deltas[e.key]);
          const target = next.toISOString().slice(0, 10);
          if (!allowed(target) || target.length !== 10) return;
          view = new Date(target.slice(0, 7) + "-01T12:00:00Z"); render(target);
        };
        grid.append(b);
      }
      const footer = document.createElement("div"); footer.className = "date-calendar-foot";
      const now = makeButton("Сегодня", () => choose(today())); now.disabled = !allowed(today());
      footer.append(now, makeButton("Очистить", () => choose("")), makeButton("Закрыть", () => { popup.hidePopover(); trigger.focus(); }));
      popup.append(header, grid, footer);
      const active = grid.querySelector('button[tabindex="0"]') || grid.querySelector("button:not(:disabled)");
      if (active) { active.tabIndex = 0; active.focus(); }
    }
    trigger.onclick = () => {
      if (popup.matches(":popover-open")) { popup.hidePopover(); return; }
      const value = iso || (input.min && today() < input.min ? input.min : input.max && today() > input.max ? input.max : today());
      view = new Date(value.slice(0, 7) + "-01T12:00:00Z");
      popup.showPopover(); render(); position();
    };
    popup.addEventListener("toggle", e => trigger.setAttribute("aria-expanded", String(e.newState === "open")));
    popup.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); popup.hidePopover(); trigger.focus(); }
    });
    addEventListener("resize", () => { if (popup.matches(":popover-open")) position(); });
  });
})(globalThis);
