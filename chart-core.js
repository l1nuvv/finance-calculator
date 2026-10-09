(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.KonturChart = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function scale(values, target = 5) {
    let min = Math.min(0, ...values),
      max = Math.max(0, ...values);
    if (min === max) max = min + 10000;
    const raw = (max - min) / Math.max(1, target - 1);
    const power = 10 ** Math.floor(Math.log10(raw));
    const ratio = raw / power;
    let step = Math.max(
      1,
      (ratio < 1.5 ? 1 : ratio < 3 ? 2 : ratio < 7 ? 5 : 10) * power,
    );
    let lower = Math.floor(min / step) * step;
    let upper = Math.ceil(max / step) * step;
    if (Math.round((upper - lower) / step) > 6) {
      step = [1, 2, 5, 10].find((n) => n * power > step) * power;
      lower = Math.floor(min / step) * step;
      upper = Math.ceil(max / step) * step;
    }
    const ticks = [];
    for (let v = lower; v <= upper + step / 100; v += step)
      ticks.push(Math.round(v));
    return { lower, upper, step, ticks };
  }
  function dates(length, width) {
    if (length <= 1) return [0];
    const count = Math.min(
      length,
      Math.max(3, Math.min(8, Math.floor(width / 85) + 1)),
    );
    return Array.from({ length: count }, (_, i) =>
      Math.round((i * (length - 1)) / (count - 1)),
    );
  }
  function nearest(x, left, right, length) {
    if (length <= 1) return 0;
    return Math.max(
      0,
      Math.min(
        length - 1,
        Math.round(((x - left) / (right - left)) * (length - 1)),
      ),
    );
  }
  return { scale, dates, nearest };
});
