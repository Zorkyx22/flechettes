import type { SyncStatus } from "../storage/cachedStore";
import { S } from "../strings";
import { el } from "./dom";

const TEXT: Record<SyncStatus, string> = {
  saving: S.syncSaving,
  saved: S.syncSaved,
  offline: S.syncOffline,
};

/** A quiet status chip for the account bar: saving… / saved / offline. */
export function createSavingIndicator(): { node: HTMLElement; set: (s: SyncStatus) => void } {
  const node = el("span", { class: "sync-status", "aria-live": "polite" });
  const set = (s: SyncStatus): void => {
    node.textContent = TEXT[s];
    node.dataset.status = s;
  };
  set("saved");
  return { node, set };
}
