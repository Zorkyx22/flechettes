import "@fontsource/andika/latin-400.css";
import "@fontsource/andika/latin-700.css";
import "./styles.css";
import { api, setUnauthorizedHandler, type PublicUser } from "./net/api";
import { CachedStore } from "./storage/cachedStore";
import { Library } from "./storage/library";
import { ServerStore } from "./storage/serverStore";
import { IdbStore } from "./storage/store";
import { S } from "./strings";
import { createAccountBar } from "./ui/accountBar";
import { startApp } from "./ui/app";
import { createAuthScreen } from "./ui/authScreen";
import { el } from "./ui/dom";
import { startIdleTimer } from "./ui/idle";
import { createSavingIndicator } from "./ui/savingIndicator";
import { confirmDialog, toast } from "./ui/toast";

const root = document.getElementById("app")!;
const IDLE_MS = 30 * 60_000;
const NOTICE_KEY = "flechettes.notice";
const LAST_USER_KEY = "flechettes.user";
const IMPORT_DONE_KEY = "flechettes.importOffered";

let store: CachedStore | null = null;
let loggingOut = false;

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
  const indicator = createSavingIndicator();
  document.body.insertBefore(
    createAccountBar({ user, extra: [indicator.node], onLogout: () => void logout() }),
    document.body.firstChild,
  );
  startIdleTimer(IDLE_MS, () => void logout(S.idleLoggedOut));

  const cached = await CachedStore.open(new ServerStore(), indicator.set);
  store = cached;
  // Shared-computer privacy: a different user signing in on this browser starts with a clean cache.
  const prev = localStorage.getItem(LAST_USER_KEY);
  if (prev && prev !== user.id) await cached.clear();
  localStorage.setItem(LAST_USER_KEY, user.id);

  const library = new Library(cached);
  await library.init();
  await maybeOfferImport(library);
  startApp(root, library);
}

/** One-time offer to pull texts from the old local-only database into this account. */
async function maybeOfferImport(library: Library): Promise<void> {
  if (localStorage.getItem(IMPORT_DONE_KEY)) return;
  try {
    const old = await IdbStore.open();
    const metas = await old.listMeta();
    if (metas.length > 0) {
      const yes = await confirmDialog({
        title: S.importOfferTitle,
        help: S.importOfferHelp(metas.length),
        yes: S.importOfferYes,
        no: S.importOfferNo,
      });
      if (yes) {
        const docs = [];
        for (const m of metas) {
          const d = await old.get(m.id);
          if (d) docs.push(d);
        }
        const n = await library.importDocs(docs);
        toast(S.importDone(n));
      }
    }
  } catch {
    /* no old database, or it could not be read: nothing to import */
  }
  localStorage.setItem(IMPORT_DONE_KEY, "1");
}

async function logout(notice?: string): Promise<void> {
  if (loggingOut) return;
  loggingOut = true;
  // Never lose work: only clear the local cache once everything has reached the server. If the
  // server is unreachable, keep the session and let the background sync keep trying.
  if (store) {
    const synced = await store.flushToServer().catch(() => false);
    if (!synced) {
      loggingOut = false;
      toast(S.logoutWaitSync);
      return;
    }
    await store.clear().catch(() => {});
  }
  localStorage.removeItem(LAST_USER_KEY);
  try {
    await api.logout();
  } catch {
    /* even if the server is unreachable now, drop the local session view */
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
