(function (root) {
  "use strict";
  const E = root.FinEngine,
    S = root.KonturSync,
    $ = (id) => document.getElementById(id);
  class SharedBudget {
    constructor({ getData, onData, onLocal }) {
      this.client = new root.KonturCloud(root.KONTUR_CONFIG);
      this.getData = getData;
      this.onData = onData;
      this.onLocal = onLocal;
      this.active = false;
      this.busy = false;
      this.base = null;
      this.revision = null;
      this.conflicts = [];
      this.bind();
      this.render();
      this.timer = setInterval(() => {
        if (!document.hidden && this.active) this.flush();
      }, 10000);
      window.addEventListener("online", () => this.flush());
      window.addEventListener("focus", () => {
        if (this.active) this.flush();
      });
      window.addEventListener("beforeunload", (event) => {
        if (this.active && this.dirty()) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
      if (this.client.user) this.run(() => this.connect());
    }
    dirty() {
      return this.active && !S.equal(this.base, this.getData());
    }
    status(message, error = false) {
      $("cloud-status").textContent = message;
      $("cloud-status").classList.toggle("error", error);
      if (this.active) {
        $("saved").textContent = message;
        $("saved").classList.toggle("error", error);
      }
    }
    cache() {
      localStorage.setItem(
        this.cacheKey,
        JSON.stringify({
          base: this.base,
          local: this.getData(),
          revision: this.revision,
        }),
      );
    }
    changed() {
      if (!this.active) return;
      if (this.conflicts.length) {
        this.conflicts = S.merge(
          this.base,
          this.getData(),
          this.conflictRemote.data,
        ).conflicts;
        this.renderConflicts();
      }
      try {
        this.cache();
        this.status("Есть изменения · синхронизация…");
      } catch {
        this.status("Копия в браузере не сохранена. Экспортируйте JSON.", true);
      }
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.flush(), 500);
    }
    async run(fn) {
      if (this.busy) return;
      this.busy = true;
      this.render();
      try {
        await fn();
      } catch (error) {
        this.status(error.message, true);
      } finally {
        this.busy = false;
        this.render();
      }
    }
    async connect() {
      if (this.active && this.activeUserId !== this.client.user.id) {
        this.active = false;
        this.base = null;
        this.remote = null;
        this.conflicts = [];
        this.renderConflicts();
        this.onLocal();
      }
      const remote = await this.client.read();
      if (remote) await this.adopt(remote);
      else this.status("Создайте общий бюджет или введите код приглашения.");
      this.render();
    }
    async adopt(remote) {
      const data = E.valid(remote.data);
      this.cacheKey =
        "kontur:cloud:v1:" + this.client.user.id + ":" + remote.id;
      let cached = null;
      const raw = localStorage.getItem(this.cacheKey);
      if (raw) {
        try {
          cached = JSON.parse(raw);
          cached.base = E.valid(cached.base);
          cached.local = E.valid(cached.local);
        } catch {
          throw Error(
            "Локальная облачная копия повреждена. Сохраните её через «Копия для восстановления» прежде чем продолжить.",
          );
        }
      }
      this.active = true;
      this.activeUserId = this.client.user.id;
      this.remote = remote;
      this.revision = remote.revision;
      this.base = cached?.base || data;
      this.onData(cached?.local || data);
      await this.reconcile(remote);
      this.render();
    }
    async reconcile(remote, choices = {}) {
      if (!remote || remote.id !== this.remote.id)
        throw Error("Общий бюджет недоступен");
      const result = S.merge(this.base, this.getData(), remote.data, choices);
      this.remote = remote;
      this.conflicts = result.conflicts;
      if (this.conflicts.length) {
        this.status("Конфликт правок: выберите версии в настройках.", true);
        this.conflictRemote = remote;
        this.renderConflicts();
        return false;
      }
      this.base = E.valid(remote.data);
      this.revision = remote.revision;
      if (!S.equal(this.getData(), result.data)) this.onData(result.data);
      this.cache();
      this.renderConflicts();
      return true;
    }
    async flush() {
      if (!this.active || this.busy || this.conflicts.length) return;
      await this.run(async () => {
        if (!navigator.onLine)
          throw Error("Нет сети · изменения ждут отправки");
        // A successful save updates only the sent baseline; later local edits stay dirty.
        for (let attempt = 0; attempt < 3; attempt++) {
          if (this.dirty()) {
            const sent = E.valid(this.getData());
            const response = await this.client.save(this.revision, sent);
            if (response.saved) {
              this.base = sent;
              this.revision = response.budget.revision;
              this.remote = response.budget;
              this.cache();
            } else if (!(await this.reconcile(response.budget))) return;
          } else {
            const remote = await this.client.read();
            if (!(await this.reconcile(remote))) return;
          }
          if (!this.dirty()) {
            this.status("Общий бюджет · синхронизирован");
            return;
          }
        }
        this.status("Изменения сохранены на устройстве · ожидают отправки");
      });
    }
    renderConflicts() {
      const host = $("sync-conflicts");
      host.replaceChildren();
      host.hidden = !this.conflicts.length;
      if (!this.conflicts.length) return;
      const title = document.createElement("h3");
      title.textContent = "Одновременные изменения";
      host.append(title);
      for (const conflict of this.conflicts) {
        const row = document.createElement("label");
        row.textContent =
          conflict.key === "snapshot"
            ? "Начальный остаток и дата"
            : conflict.local?.name ||
              conflict.remote?.name ||
              "Удалённая операция";
        const versions = document.createElement("p");
        versions.className = "footnote";
        const describe = (value) =>
          value === undefined
            ? "Удалено"
            : Array.isArray(value)
              ? value[0] + " · " + E.amount(value[1])
              : `${value.name} · ${E.amount(value.cents)} · ${value.date} · ${value.repeat} · ${value.paid ? "учтено" : "в прогнозе"} · ${value.confidence} · ${value.category}`;
        versions.textContent =
          "На устройстве: " +
          describe(conflict.local) +
          "\nВ облаке: " +
          describe(conflict.remote);
        const select = document.createElement("select");
        select.dataset.conflict = conflict.key;
        for (const [value, text] of [
          ["", "Выберите версию"],
          ["local", "Оставить мою"],
          ["remote", "Оставить облачную"],
        ]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          select.append(option);
        }
        row.append(versions, select);
        host.append(row);
      }
      const button = document.createElement("button");
      button.textContent = "Применить выбор";
      button.className = "primary";
      button.onclick = () =>
        this.run(async () => {
          const choices = Object.fromEntries(
            [...host.querySelectorAll("select")].map((n) => [
              n.dataset.conflict,
              n.value,
            ]),
          );
          if (Object.values(choices).some((v) => !v))
            throw Error("Выберите версию для каждого конфликта");
          // Apply choices against the exact versions displayed, then recheck new cloud edits.
          await this.reconcile(this.conflictRemote, choices);
          this.status("Выбор сохранён на устройстве · синхронизация…");
        }).then(() => this.flush());
      host.append(button);
    }
    render() {
      const signedIn = !!this.client.user;
      $("auth-form").hidden = signedIn;
      $("cloud-signed-in").hidden = !signedIn;
      $("cloud-user").textContent = signedIn
        ? this.client.user.email.split("@")[0]
        : "";
      $("cloud-setup").hidden = !signedIn || this.active;
      $("cloud-connected").hidden = !this.active;
      $("cloud-members").textContent = this.active
        ? `Участников: ${this.remote.members} из 2`
        : "";
      $("invite-button").hidden =
        !this.active || !this.remote.owner || this.remote.members >= 2;
      document
        .querySelectorAll("[data-cloud-action]")
        .forEach((button) => (button.disabled = this.busy));
      $("reset").textContent = this.active
        ? "Очистить общий бюджет"
        : "Очистить данные";
      $("storage-mode").textContent = this.active
        ? "Общий бюджет"
        : "Локальный бюджет";
      $("storage-mode-note").textContent = this.active
        ? "Облако и копия на устройстве"
        : "Подключите синхронизацию в настройках";
      document.body.classList.toggle("cloud-active", this.active);
    }
    bind() {
      $("auth-form").onsubmit = (event) => {
        event.preventDefault();
        const login = $("auth-login").value.trim().toLowerCase(),
          password = $("auth-password").value;
        if (!/^[a-z0-9_-]{3,32}$/.test(login)) {
          this.status("Логин: 3–32 латинских символа, цифры, _ или -", true);
          return;
        }
        const email = login + "@users.kontur.invalid";
        this.run(async () => {
          await this.client.signIn(email, password);
          $("auth-password").value = "";
          await this.connect();
        });
      };
      $("cloud-create").onclick = () =>
        this.run(async () => {
          if (
            !confirm(
              "Сохранить текущие данные в новом общем бюджете? Второй участник подключится по приглашению.",
            )
          )
            return;
          await this.adopt(await this.client.create(E.valid(this.getData())));
          this.status("Общий бюджет создан");
        });
      $("cloud-join").onclick = () =>
        this.run(async () => {
          const code = $("invite-input").value.trim();
          if (!/^[a-f0-9]{64}$/.test(code))
            throw Error("Введите полный код приглашения");
          if (
            !confirm(
              "Открыть общий бюджет? Текущие локальные данные останутся в отдельной копии на этом устройстве.",
            )
          )
            return;
          await this.adopt(await this.client.join(code));
          $("invite-input").value = "";
          this.status("Общий бюджет подключён");
        });
      $("invite-button").onclick = () =>
        this.run(async () => {
          const code = await this.client.invite();
          $("invite-output").value = code;
          $("invite-result").hidden = false;
          this.status(
            "Передайте код второму участнику. Он действует 7 дней и используется один раз.",
          );
        });
      $("copy-invite").onclick = async () => {
        try {
          await navigator.clipboard.writeText($("invite-output").value);
          this.status("Код скопирован");
        } catch {
          $("invite-output").select();
          this.status("Выделенный код можно скопировать вручную");
        }
      };
      $("sync-now").onclick = () => this.flush();
      $("signout").onclick = async () => {
        if (this.dirty()) {
          await this.flush();
          if (this.dirty()) {
            this.status(
              "Сначала синхронизируйте изменения или разрешите конфликт. JSON можно скачать в настройках.",
              true,
            );
            return;
          }
        }
        await this.run(async () => {
          await this.client.signOut().catch(() => {});
          this.active = false;
          this.base = null;
          this.remote = null;
          this.conflicts = [];
          this.renderConflicts();
          $("invite-result").hidden = true;
          $("invite-output").value = "";
          this.onLocal();
          this.status("Вы вышли из общего бюджета");
        });
      };
      $("cloud-recovery").onclick = () => {
        const files = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith("kontur:cloud:v1:" + this.client.user?.id + ":"))
            files[key] = localStorage.getItem(key);
        }
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(files, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "kontur-recovery.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
    }
  }
  root.SharedBudget = SharedBudget;
})(globalThis);
