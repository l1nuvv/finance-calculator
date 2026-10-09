(function () {
  "use strict";
  const hints = {
    start:
      "Дата начального остатка. Операции этого дня и следующих дней прибавляются или вычитаются из него. Остаток и дату меняйте вместе в настройках.",
    period:
      "На сколько дней вперёд рассчитывать остаток, начиная с даты отсчёта. Период не меняет сохранённые операции.",
    scenario:
      "Базовый учитывает все плановые доходы. Консервативный исключает доходы с отметкой «Ожидается», но сохраняет расходы. Подтверждённые доходы и факты входят в оба варианта. Резерв обязательных платежей рассчитывается отдельно.",
    balance:
      "Деньги на дату отсчёта до операций этого дня. Это исходная точка расчёта, а не автоматический баланс банка. Не включайте повторно операции, которые уже учтены в этой сумме.",
    "setting-date":
      "Дата, к которой относится начальный остаток. Меняйте их вместе. Операции с фактической датой раньше этой даты не прибавляются повторно.",
    "event-type":
      "Доход и получение займа увеличивают остаток, расход и возврат долга уменьшают его. Перевод между своими счетами общий остаток не меняет.",
    "event-amount":
      "Ожидаемая сумма одного платежа. Реальную сумму и дату отметьте через «Факт» в списке операций — план этого повторения будет заменён.",
    "event-repeat":
      "Создаёт будущие платежи из одной операции. Каждый месяц сохраняет день, а в коротком месяце берёт последний доступный. Дважды в месяц — 10 и 25 числа, начиная с даты операции.",
    "event-end":
      "Последняя дата повторений включительно. Если не заполнено, операция повторяется дальше в пределах расчётного периода.",
    "event-confidence":
      "«Ожидается» исключает неподтверждённый доход из консервативного прогноза. «Подтверждено» и «Уже известно точно» входят в оба сценария. Это не отметка получения денег: используйте «Факт».",
    "event-required":
      "Отмечайте аренду, кредит и другие обязательные расходы или возвраты долга. Деньги на них входят в резерв до ближайшего основного дохода. Обычные расходы остаются в прогнозе даже без этой галочки.",
    "event-salary":
      "Отмечайте зарплату или другой основной доход. Ближайшее такое поступление задаёт конец периода резерва обязательных платежей. Без него резерв считается на 30 дней.",
    "event-paid":
      "Исключает всю операцию из расчёта: все повторения и факты. Для оплаты одного месяца используйте «Факт», иначе будущие месяцы тоже исчезнут из прогноза.",
    "fact-planned":
      "Какое повторение оплачено: его дата по плану. Например, октябрьская аренда. Для разовой операции укажите её плановую дату.",
    "fact-date":
      "Когда деньги действительно поступили или были потрачены. Если сумма уже входит в начальный остаток, эта дата должна быть раньше даты отсчёта.",
    "fact-amount":
      "Реально полученная или потраченная сумма. Заменяет план выбранного повторения, а не добавляется второй раз.",
    "loan-r":
      "Годовая процентная ставка. Калькулятор использует равномерную месячную ставку и округление до копеек; расчёт банка может отличаться.",
    "loan-extra":
      "Доплата сверх обычного ежемесячного платежа. Показывает ориентировочное сокращение срока и процентов.",
    "loan-type":
      "Аннуитет — примерно одинаковые платежи. Дифференцированный — равные части основного долга, поэтому платежи постепенно уменьшаются.",
    "what-amount":
      "Временный сценарий дополнительного займа. Кнопка «Сравнить» не добавляет заём и возврат в ваш бюджет.",
  };
  const tip = document.createElement("div");
  tip.id = "field-help";
  tip.className = "field-help";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let active = null,
    pinned = false;
  function hide() {
    tip.hidden = true;
    active = null;
    pinned = false;
  }
  function show(label, button, text) {
    active = label;
    tip.textContent = text;
    const dialog = label.closest("dialog");
    (dialog || document.body).append(tip);
    tip.hidden = false;
    const host = dialog?.getBoundingClientRect();
    const left = host ? Math.max(8, host.left + 8) : 8;
    const right = host
      ? Math.min(innerWidth - 8, host.left + dialog.clientWidth - 8)
      : innerWidth - 8;
    const top = host ? Math.max(8, host.top + 8) : 8;
    const bottom = host
      ? Math.min(innerHeight - 8, host.bottom - 8)
      : innerHeight - 8;
    tip.style.width = Math.min(320, right - left) + "px";
    tip.style.maxHeight = Math.min(260, bottom - top) + "px";
    const rect = button.getBoundingClientRect();
    const width = tip.offsetWidth,
      height = tip.offsetHeight;
    tip.style.left = Math.max(left, Math.min(rect.left, right - width)) + "px";
    const below = rect.bottom + 8;
    tip.style.top =
      Math.max(
        top,
        Math.min(
          below + height <= bottom ? below : rect.top - height - 8,
          bottom - height,
        ),
      ) + "px";
  }
  for (const [id, text] of Object.entries(hints)) {
    const control = document.getElementById(id),
      label = control?.closest("label");
    if (!label) continue;
    const name = [...label.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "help-button";
    button.textContent = "?";
    button.setAttribute("aria-label", "Подсказка: " + name);
    if (!control.hasAttribute("aria-label"))
      control.setAttribute("aria-label", name);
    button.setAttribute("aria-describedby", tip.id);
    control.setAttribute(
      "aria-describedby",
      [control.getAttribute("aria-describedby"), tip.id]
        .filter(Boolean)
        .join(" "),
    );
    if (label.classList.contains("check")) label.append(button);
    else {
      const title = document.createElement("span");
      title.className = "label-title";
      if (label.firstChild?.nodeType === Node.TEXT_NODE)
        title.append(label.firstChild);
      title.append(button);
      label.prepend(title);
    }
    label.addEventListener("mouseenter", () => {
      if (matchMedia("(hover: hover)").matches && !pinned)
        show(label, button, text);
    });
    label.addEventListener("mouseleave", () => {
      if (!pinned && active === label) hide();
    });
    label.addEventListener("focusin", () => {
      if (!pinned) show(label, button, text);
    });
    label.addEventListener("focusout", (event) => {
      if (!label.contains(event.relatedTarget) && active === label) hide();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (pinned && active === label) hide();
      else {
        pinned = true;
        show(label, button, text);
      }
    });
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        active &&
        !active.contains(event.target) &&
        !tip.contains(event.target)
      )
        hide();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !tip.hidden) {
        hide();
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  document
    .querySelectorAll("dialog")
    .forEach((dialog) => dialog.addEventListener("close", hide));
})();
