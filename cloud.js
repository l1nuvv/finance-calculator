/* Supabase REST client: browser publishable key + authenticated RPCs only. */
(function (root) {
  "use strict";
  class Cloud {
    constructor(config) {
      this.url = config.supabaseUrl.replace(/\/$/, "");
      this.key = config.supabaseKey;
      this.refreshing = null;
      this.persistent = false;
      this.session = this.storedSession();
      // Keep an existing tab signed in when upgrading from tab-only storage.
      if (!this.session) {
        try {
          this.session = this.validSession(
            sessionStorage.getItem("kontur:session"),
          );
        } catch {}
      }
      if (this.session) this.remember(this.session);
      root.addEventListener?.("storage", (event) => {
        if (event.key !== "kontur:session" && event.key !== null) return;
        this.persistent = true;
        this.session = this.storedSession();
        this.onSessionChange?.();
      });
    }
    validSession(raw) {
      try {
        const session = JSON.parse(raw || "null");
        if (
          session &&
          typeof session.user?.id === "string" &&
          typeof session.user?.email === "string" &&
          typeof session.access_token === "string" &&
          typeof session.refresh_token === "string"
        )
          return session;
      } catch {}
      return null;
    }
    storedSession() {
      try {
        return this.validSession(localStorage.getItem("kontur:session"));
      } catch {
        return this.session || null;
      }
    }
    get user() {
      return this.session?.user ?? null;
    }
    remember(session) {
      this.session = session;
      try {
        if (session)
          localStorage.setItem("kontur:session", JSON.stringify(session));
        else localStorage.removeItem("kontur:session");
        this.persistent = true;
        sessionStorage.removeItem("kontur:session");
      } catch {
        this.persistent = false;
        // Browsers that block persistent storage can still use the current tab.
        try {
          if (session)
            sessionStorage.setItem("kontur:session", JSON.stringify(session));
          else sessionStorage.removeItem("kontur:session");
        } catch {}
      }
    }
    async request(path, body, authenticated = true, method = "POST") {
      const userId = this.user?.id;
      if (authenticated) {
        await this.token();
        if (this.user?.id !== userId)
          throw Error("Аккаунт изменился в другой вкладке. Откройте бюджет заново.");
      }
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
      if (authenticated && this.user?.id !== userId)
        throw Error("Аккаунт изменился в другой вкладке. Откройте бюджет заново.");
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
        const error = Error(
          messages[code] ||
            data?.msg ||
            data?.message ||
            data?.error_description ||
            "Ошибка облака: " + response.status,
        );
        error.code = code;
        throw error;
      }
      return data;
    }
    async token() {
      if (!this.refreshing) {
        const refresh = () => this.refreshToken();
        // Refresh tokens are shared by tabs, so only one tab rotates them at a time.
        this.refreshing = (
          globalThis.navigator?.locks
            ? navigator.locks.request("kontur:session-refresh", refresh)
            : refresh()
        ).finally(() => {
          this.refreshing = null;
        });
      }
      await this.refreshing;
    }
    async refreshToken() {
      if (this.persistent) this.session = this.storedSession();
      if (!this.session?.refresh_token)
        throw Error("Войдите в аккаунт для синхронизации");
      if ((this.session.expires_at || 0) > Date.now() / 1000 + 60) return;
      const refreshToken = this.session.refresh_token;
      try {
        const s = await this.request(
          "/auth/v1/token?grant_type=refresh_token",
          { refresh_token: refreshToken },
          false,
        );
        if (this.persistent) {
          const current = this.storedSession();
          if (current?.refresh_token !== refreshToken) {
            this.session = current;
            return;
          }
        }
        this.remember({
          ...s,
          expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
        });
      } catch (error) {
        // A refresh started by the previous account must not clear a newer login.
        if (this.persistent && this.storedSession()?.refresh_token !== refreshToken) {
          this.session = this.storedSession();
          throw error;
        }
        // Invalid refresh credentials require a fresh login; network errors keep the session.
        if (
          [
            "refresh_token_not_found",
            "refresh_token_already_used",
            "session_not_found",
          ].includes(error.code) ||
          /refresh token|invalid grant|session not found/i.test(error.message)
        ) {
          this.remember(null);
          throw Error("Сохранённый вход больше не действует. Войдите заново.");
        }
        throw error;
      }
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
