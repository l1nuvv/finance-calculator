(function () {
  "use strict";
  let prompt;
  const install = document.getElementById("install-app"),
    note = document.getElementById("install-note");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    install.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    install.hidden = true;
    note.textContent = "Контур установлен на этом устройстве.";
  });
  install.onclick = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    install.hidden = true;
  };
  if (matchMedia("(display-mode: standalone)").matches)
    note.textContent = "Контур открыт как приложение.";
  if ("serviceWorker" in navigator)
    window.addEventListener("load", () =>
      navigator.serviceWorker
        .register("sw.js", { updateViaCache: "none" })
        .catch(() => {
          note.textContent += " Офлайн-режим недоступен в этом браузере.";
        }),
    );
})();
