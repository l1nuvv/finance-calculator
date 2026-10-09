(function () {
  "use strict";
  const hints = {
    start:
      "С какого дня считать деньги. Расчёт начинается с суммы, указанной в настройках, и учитывает платежи уже в этот день.",
    period:
      "На сколько дней вперёд посмотреть, хватит ли денег. Например, 30 дней — примерно на месяц.",
    scenario:
      "Обычно выбирайте «Консервативный»: он покажет, хватит ли денег без премии и других доходов под вопросом. «Базовый» считает, что придут все запланированные деньги.",
    balance:
      "Сколько денег у вас было в начале выбранного дня, до покупок и поступлений. Сайт не проверяет счета в банке — сумму вводите вы.",
    "setting-date":
      "День, на начало которого вы указали сумму денег. Меняйте дату вместе с суммой, иначе старые платежи могут посчитаться ещё раз.",
    "event-type":
      "Зарплата — «Доход», покупка — «Расход». Взяли в долг — «Получение займа», отдали — «Возврат долга». Перевод между своими счетами не меняет общую сумму денег.",
    "event-amount":
      "Сколько денег ожидаете получить или потратить за один раз. Когда всё произойдёт, нажмите «Факт» у операции и укажите, сколько получилось на самом деле.",
    "event-repeat":
      "Выберите повторение, чтобы не добавлять каждый платёж вручную. Например, аренду раз в месяц. «Дважды в месяц» — 10 и 25 числа.",
    "event-end":
      "До какого дня повторять платёж. Оставьте пустым, если даты окончания пока нет.",
    "event-confidence":
      "Для обычной зарплаты выбирайте «Подтверждено / запланировано». Для премии, которую могут не дать, — «Ожидается». Если деньги уже пришли, отметьте это кнопкой «Факт».",
    "event-required":
      "Поставьте для аренды, кредита и других платежей, которые нельзя пропустить. Сайт покажет, сколько денег нужно оставить на них до зарплаты. Без галочки расход всё равно считается.",
    "event-salary":
      "Поставьте для зарплаты или другого главного дохода. Сайт посчитает, сколько оставить на важные платежи до этих денег. Если такой доход не указан, считает на 30 дней.",
    "event-paid":
      "Обычно оставляйте пустым. Галочка убирает из расчёта всю операцию, включая будущие месяцы. Заплатили только за один месяц? Нажмите «Факт» у операции.",
    "fact-planned":
      "Какой именно платёж отмечаете. Например, октябрьскую аренду, даже если оплатили её в сентябре. Выберите дату, на которую этот платёж был запланирован.",
    "fact-date":
      "В какой день деньги действительно пришли или вы их потратили. Укажите настоящую дату.",
    "fact-amount":
      "Сколько денег действительно пришло или ушло. Эта сумма заменит ожидаемую: второй раз сайт её не прибавит и не вычтет.",
    "loan-r":
      "Процент в год из условий кредита. Например, для ставки 20% введите 20. Итог здесь примерный, точные платежи смотрите у банка.",
    "loan-extra":
      "Сколько готовы платить каждый месяц сверх обычного платежа. Сайт покажет, насколько раньше сможете закрыть кредит и сколько сэкономите на процентах.",
    "loan-type":
      "«Аннуитет» — примерно одинаковый платёж каждый месяц. «Дифференцированный» — сначала платите больше, потом всё меньше.",
    "what-amount":
      "Сколько хотите взять в долг для проверки «а что, если». «Сравнить» покажет результат, но не добавит этот долг в ваши операции.",
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
