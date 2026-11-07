import type { PublicUser } from "../net/api";
import { S } from "../strings";
import { el } from "./dom";

/** Persistent top bar: who is signed in and the always-available logout. */
export function createAccountBar(opts: { user: PublicUser; onLogout: () => void; extra?: Node[] }): HTMLElement {
  const role = S.roleName[opts.user.role] ?? opts.user.role;
  return el(
    "div",
    { class: "account-bar" },
    el("span", { class: "account-who" }, el("strong", { text: opts.user.username }), el("small", { text: ` · ${role}` })),
    el("span", { class: "account-actions" }, ...(opts.extra ?? []), el("button", {
      class: "btn quiet",
      text: S.logout,
      onclick: opts.onLogout,
    })),
  );
}
