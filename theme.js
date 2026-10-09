(function () {
  "use strict";
  let choice;
  try {
    choice = localStorage.getItem("kontur:theme");
  } catch {}
  const dark =
    choice === "dark" ||
    (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
