export type Paper = "lined" | "plain";
export type Settings = { paper: Paper };

const KEY = "flechettes.settings";

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    // A stored "seyes" (the old grid paper) now means lined paper.
    return { paper: raw.paper === "plain" ? "plain" : "lined" };
  } catch {
    return { paper: "lined" };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Settings are cosmetic; losing them is harmless.
  }
}

export function applySettings(s: Settings): void {
  document.documentElement.dataset.paper = s.paper;
}
