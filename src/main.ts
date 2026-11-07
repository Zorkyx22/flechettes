import "@fontsource/andika/latin-400.css";
import "@fontsource/andika/latin-700.css";
import "./styles.css";
import { api, setUnauthorizedHandler, type PublicUser } from "./net/api";
import { Library } from "./storage/library";
import { IdbStore } from "./storage/store";
import { S } from "./strings";
import { createAccountBar } from "./ui/accountBar";
import { startApp } from "./ui/app";
import { createAuthScreen } from "./ui/authScreen";
import { el } from "./ui/dom";
import { startIdleTimer } from "./ui/idle";

const root = document.getElementById("app")!;
const IDLE_MS = 30 * 60_000;
const NOTICE_KEY = "flechettes.notice";

/** Carry a one-line notice (e.g. "session expired") across the reload used for auth transitions. */
function takeNotice(): string | undefined {
  const n = sessionStorage.getItem(NOTICE_KEY);
  if (n) sessionStorage.removeItem(NOTICE_KEY);
  return n ?? undefined;
}
function reloadWithNotice(notice?: string): void {
  if (notice) sessionStorage.setItem(NOTICE_KEY, notice);
  location.reload();
}

function showAuth(mode: "setup" | "login"): void {
  root.replaceChildren(createAuthScreen({ mode, notice: takeNotice(), onAuthed: () => location.reload() }));
}

async function enterApp(user: PublicUser): Promise<void> {
  document.body.insertBefore(
    createAccountBar({ user, onLogout: () => void logout() }),
    document.body.firstChild,
  );
  startIdleTimer(IDLE_MS, () => void logout(S.idleLoggedOut));
  // Stage 1: texts are still local; Stage 2 swaps this for the server-backed store.
  const library = new Library(await IdbStore.open());
  await library.init();
  startApp(root, library);
}

let loggingOut = false;
async function logout(notice?: string): Promise<void> {
  if (loggingOut) return;
  loggingOut = true;
  try {
    await api.logout();
  } catch {
    /* even if the server is unreachable, drop the local session view */
  }
  reloadWithNotice(notice);
}

setUnauthorizedHandler(() => reloadWithNotice(S.sessionExpired));

async function main(): Promise<void> {
  try {
    const session = await api.session();
    if (session.needsSetup) showAuth("setup");
    else if (!session.user) showAuth("login");
    else await enterApp(session.user);
  } catch {
    root.replaceChildren(el("p", { class: "fatal", text: S.networkError }));
  }
}

void main();
