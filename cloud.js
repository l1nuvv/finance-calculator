/* Supabase REST client: browser publishable key + authenticated RPCs only. */
(function (root) {
  "use strict";
  class Cloud {
    constructor(config) {
      this.url = config.supabaseUrl.replace(/\/$/, "");
      this.key = config.supabaseKey;
      this.refreshing = null;
      this.session = null;
      try {
        this.session = JSON.parse(
          sessionStorage.getItem("kontur:session") || "null",
        );
      } catch {}
      if (
        this.session &&
        (typeof this.session.user?.id !== "string" ||
          typeof this.session.user?.email !== "string" ||
          typeof this.session.access_token !== "string" ||
          typeof this.session.refresh_token !== "string")
      )
        this.session = null;
    }
    get user() {
      return this.session?.user ?? null;
    }
    remember(session) {
      this.session = session;
      try {
        if (session)
          sessionStorage.setItem("kontur:session", JSON.stringify(session));
        else sessionStorage.removeItem("kontur:session");
      } catch {}
    }
    async request(path, body, authenticated = true, method = "POST") {
      if (authenticated) await this.token();
      const response = await fetch(this.url + path, {
        method,
        headers: {
          apikey: this.key,
          "Content-Type": "application/json",
          ...(authenticated
            ? { Authorization: "Bearer " + this.session.access_token }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const code = data?.error_code || data?.code;
        const messages = {
          invalid_credentials: "Неверный логин или пароль",
          email_not_confirmed:
            "Аккаунт ещё не активирован. Обратитесь к владельцу приложения.",
          P0001: data?.message,
          23505: "Вы уже подключены к бюджету",
          42501: "Нет доступа к этому бюджету",
        };
        throw Error(
          messages[code] ||
            data?.msg ||
            data?.message ||
            data?.error_description ||
            "Ошибка облака: " + response.status,
        );
      }
      return data;
    }
    async token() {
      if (!this.session?.refresh_token)
        throw Error("Войдите в аккаунт для синхронизации");
      if ((this.session.expires_at || 0) > Date.now() / 1000 + 60) return;
      if (!this.refreshing)
        this.refreshing = this.request(
          "/auth/v1/token?grant_type=refresh_token",
          { refresh_token: this.session.refresh_token },
          false,
        )
          .then((s) => {
            this.remember({
              ...s,
              expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
            });
          })
          .catch((error) => {
            // Invalid refresh credentials require a fresh login; network errors keep the session.
            if (
              /refresh token|invalid grant|session not found/i.test(
                error.message,
              )
            )
              this.remember(null);
            throw error;
          })
          .finally(() => {
            this.refreshing = null;
          });
      await this.refreshing;
    }
    async signIn(email, password) {
      const s = await this.request(
        "/auth/v1/token?grant_type=password",
        { email, password },
        false,
      );
      this.remember({
        ...s,
        expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
      });
      return s.user;
    }
    async signOut() {
      try {
        await this.request("/auth/v1/logout?scope=local", undefined);
      } finally {
        this.remember(null);
      }
    }
    rpc(name, params = {}) {
      return this.request("/rest/v1/rpc/" + name, params);
    }
    read() {
      return this.rpc("kontur_read");
    }
    history() {
      return this.rpc("kontur_history");
    }
    undo(id, revision) {
      return this.rpc("kontur_undo", { p_history: id, p_revision: revision });
    }
    create(data) {
      return this.rpc("kontur_create", { p_data: data });
    }
    join(code) {
      return this.rpc("kontur_join", { p_code: code.trim() });
    }
    invite() {
      return this.rpc("kontur_invite");
    }
    save(revision, data) {
      return this.rpc("kontur_save", { p_revision: revision, p_data: data });
    }
  }
  root.KonturCloud = Cloud;
})(globalThis);
