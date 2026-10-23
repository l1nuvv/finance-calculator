(function () {
  "use strict";
  let prompt,
    registration,
    checking = false,
    lastCheck = 0,
    serverBuild = null,
    workerBuild = null;
  const install = document.getElementById("install-app"),
    note = document.getElementById("install-note"),
    update = document.getElementById("app-update"),
    check = document.getElementById("check-update"),
    updateNote = document.getElementById("update-note"),
    build = document.querySelector('meta[name="kontur-build"]').content;
  document.getElementById("release-version").textContent = "Версия на устройстве: " + build;
  const requestVersion = () =>
    navigator.serviceWorker.controller?.postMessage({ type: "KONTUR_VERSION" });
  document.getElementById("apply-update").onclick = () => {
    if (document.querySelector("dialog[open]")) {
      update.querySelector("span").textContent =
        "Сначала сохрани или закрой открытую операцию, затем нажми «Обновить».";
      return;
    }
    const target = new URL("index.html", location.href);
    target.searchParams.set("kontur-build", workerBuild && workerBuild !== build ? workerBuild : serverBuild || build);
    target.searchParams.set("updated", String(Date.now()));
    location.replace(target.href);
  };
  async function checkUpdates(manual = false) {
    if (!registration || checking || (!manual && Date.now() - lastCheck < 60000))
      return;
    checking = true;
    check.disabled = true;
    lastCheck = Date.now();
    if (manual) updateNote.textContent = "Проверяем обновление…";
    try {
      const target = new URL("index.html", location.href);
      target.searchParams.set("kontur-check", String(Date.now()));
      const response = await fetch(target.href, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error("Release unavailable");
      serverBuild = (await response.text()).match(/name="kontur-build"\s+content="([^"]+)"/)?.[1];
      if (!serverBuild) throw Error("Release version missing");
      await registration.update();
      const worker = registration.installing;
      if (worker?.state === "redundant") throw Error("Update unavailable");
      if (worker && worker.state !== "activated") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => finish(Error("Update timeout")), 20000);
          function finish(error) {
            clearTimeout(timer);
            worker.removeEventListener("statechange", changed);
            error ? reject(error) : resolve();
          }
          function changed() {
            if (worker.state === "activated") finish();
            else if (worker.state === "redundant")
              finish(Error("Update unavailable"));
          }
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      requestVersion();
      update.hidden = serverBuild === build && (!workerBuild || workerBuild === build);
      updateNote.textContent = update.hidden
        ? "Проверено по серверу: установлена последняя версия."
        : "На сервере есть новая версия. Нажми «Обновить» в сообщении сверху.";
    } catch {
      serverBuild = null;
      updateNote.textContent =
        "Не удалось связаться с сервером обновлений. Открыта сохранённая версия. Проверь интернет и попробуй ещё раз.";
    } finally {
      checking = false;
      check.disabled = false;
    }
  }
  check.onclick = () => checkUpdates(true);
  check.disabled = true;
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (
        event.source !== navigator.serviceWorker.controller ||
        event.data?.type !== "KONTUR_VERSION"
      ) return;
      workerBuild = event.data.build;
      update.hidden = workerBuild === build && (!serverBuild || serverBuild === build);
      if (!update.hidden)
        updateNote.textContent = "Новая версия готова. Нажми «Обновить» в сообщении сверху.";
    });
    navigator.serviceWorker.addEventListener("controllerchange", requestVersion);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkUpdates();
    });
    window.addEventListener("online", () => checkUpdates());
    window.addEventListener("load", async () => {
      try {
        registration = await navigator.serviceWorker.register("sw.js", {
          updateViaCache: "none",
        });
        check.disabled = false;
        requestVersion();
        await checkUpdates();
      } catch {
        note.textContent += " Офлайн-режим недоступен в этом браузере.";
        updateNote.textContent =
          "Не удалось включить обновления. Проверь интернет и открой приложение заново.";
      }
    });
  } else {
    check.hidden = true;
  }
})();
