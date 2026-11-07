import type { PublicUser } from "../net/api";
import type { Library } from "../storage/library";
import { S } from "../strings";
import { createEditorScreen } from "./editorScreen";
import { createListScreen } from "./listScreen";
import { createManageScreen } from "./manageScreen";
import { applySettings, loadSettings } from "./settings";
import { toast } from "./toast";

const ROUTE = /^#\/t\/([A-Za-z0-9_-]{1,64})$/;

export function startApp(root: HTMLElement, library: Library, user: PublicUser): void {
  const settings = loadSettings();
  applySettings(settings);
  let token = 0;

  async function show(): Promise<void> {
    const mine = ++token;
    if (location.hash === "#/gestion" && user.role !== "student") {
      root.replaceChildren(createManageScreen({ user, goBack: () => (location.hash = "#/") }));
      return;
    }
    const match = ROUTE.exec(location.hash);
    if (!match) {
      root.replaceChildren(createListScreen({ library, open: (id) => (location.hash = `#/t/${id}`) }));
      return;
    }
    const doc = await library.open(match[1]!);
    if (mine !== token) return;
    if (!doc || doc.deletedAt !== null) {
      toast(S.loadFailed);
      location.hash = "#/";
      return;
    }
    root.replaceChildren(createEditorScreen({ doc, library, settings, goBack: () => (location.hash = "#/") }));
  }

  window.addEventListener("hashchange", () => void show());
  // Persist off the interaction path, but never lose work when the tab goes away.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void library.flush();
  });
  window.addEventListener("pagehide", () => void library.flush());
  void show();
}
