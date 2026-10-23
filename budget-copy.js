(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./engine.js"));
  else root.KonturBudgetCopy = factory(root.FinEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";
  const dates = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const date = (value) => dates.format(new Date(value + "T12:00:00Z"));
  const types = {
    expense: "Расход", income: "Доход", borrow: "Получение займа",
    repay: "Возврат долга", transfer: "Перевод между своими счетами",
  };
  const repeats = {
    once: "Один раз", weekly: "Раз в неделю", biweekly: "Раз в 2 недели",
    monthly: "Каждый месяц", twice: "Дважды в месяц",
  };
  const confidence = {
    confirmed: "Подтверждено / запланировано", expected: "Ожидается",
    actual: "Уже известно точно",
  };
  // Plain text only: callers must use textContent or escape before inserting HTML.
  function describeEvent(value, data) {
    if (!value) return "Удалено";
    const repeat = value.repeat || "once";
    const lines = [
      value.name,
      `Тип: ${types[value.type]}`,
      `Сумма по расписанию: ${E.amount(value.cents)}`,
      `Дата начала: ${date(value.date)}`,
      `Повторение: ${repeats[repeat]}`,
    ];
    if (repeat === "twice")
      lines.push(`Дни месяца: ${(value.days || [10, 25]).join(", ")}`);
    else if (value.days?.length)
      lines.push(`Сохранённые дни месяца: ${value.days.join(", ")} (для этого повторения не используются)`);
    lines.push(
      `Повторять до: ${value.end ? date(value.end) : "без даты окончания"}`,
      `Надёжность поступления: ${confidence[value.confidence || "confirmed"]}`,
      `Категория: ${value.category || "не указана"}`,
      `Вся операция уже учтена: ${value.paid ? "да, все повторения исключены из прогноза" : "нет"}`,
      `Обязательный расход: ${(value.required ?? ["expense", "repay"].includes(value.type)) ? "да" : "нет"}`,
      `Основной доход: ${(value.salary ?? value.type === "income") ? "да" : "нет"}`,
      `Добавил(а): ${value.author || "автор не указан"}`,
      `Чьи деньги: ${data ? E.participants(data)[E.eventPerson(data, value)].name : value.person === 1 ? "второй участник" : "первый участник"}`,
    );
    const facts = [...(value.actuals || [])].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    lines.push(facts.length ? "Отмеченные платежи:" : "Отмеченные платежи: нет");
    for (const fact of facts)
      lines.push(`За ${date(fact.plannedDate)}: ${E.amount(fact.cents)}, деньги ${value.type === "income" || value.type === "borrow" ? "пришли" : "ушли"} ${date(fact.date)}`);
    return lines.join("\n");
  }
  return { describeEvent, date };
});
