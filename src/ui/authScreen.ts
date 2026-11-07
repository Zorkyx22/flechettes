import { api, ApiError, type PublicUser } from "../net/api";
import { S } from "../strings";
import { el, noAssist } from "./dom";

type Mode = "setup" | "login";

/** The first-run setup form (create admin) or the login form, by mode. */
export function createAuthScreen(opts: { mode: Mode; notice?: string; onAuthed: (user: PublicUser) => void }): HTMLElement {
  const { mode } = opts;
  const isSetup = mode === "setup";

  const user = el("input", { type: "text", id: "auth-user", autofocus: true });
  const pass = el("input", { type: "password", id: "auth-pass" });
  noAssist(user);
  noAssist(pass);

  const error = el("p", { class: "auth-error", role: "alert", hidden: true });
  const submit = el("button", { class: "btn primary big", type: "submit", text: isSetup ? S.setupButton : S.loginButton });

  function showError(msg: string): void {
    error.textContent = msg;
    error.hidden = false;
  }

  const form = el(
    "form",
    { class: "auth-form" },
    el("h1", { text: isSetup ? S.setupTitle : S.loginTitle }),
    isSetup ? el("p", { class: "help", text: S.setupHelp }) : null,
    opts.notice ? el("p", { class: "auth-notice", text: opts.notice }) : null,
    el("label", { for: "auth-user", text: S.loginUser }),
    user,
    el("label", { for: "auth-pass", text: S.loginPassword }),
    pass,
    error,
    submit,
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const username = user.value.trim();
    const password = pass.value;
    if (username === "") return showError(S.usernameNeeded);
    if (password.length < 4) return showError(S.passwordTooShort);
    submit.setAttribute("disabled", "");
    try {
      const { user: authed } = isSetup ? await api.setup(username, password) : await api.login(username, password);
      opts.onAuthed(authed);
    } catch (err) {
      submit.removeAttribute("disabled");
      if (err instanceof ApiError) showError(isSetup ? S.networkError : S.loginFailed);
      else showError(S.networkError);
    }
  });

  return el("div", { class: "screen auth" }, form);
}
