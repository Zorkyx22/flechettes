const NS = "http://www.w3.org/2000/svg";

/** Simple stroke icons on a 24×24 grid, built as DOM nodes (no markup strings). */
const PATHS: Record<string, string[]> = {
  back: ["M15 5 L8 12 L15 19"],
  write: ["M4 20 L5 15 L16 4 L20 8 L9 19 Z", "M14 6 L18 10"],
  correct: ["M4 12 L9 17 L20 6"],
  identify: ["M3 12 L12 3 H21 V12 L12 21 Z", "M16.5 7.5 H16.6"],
  arrow: ["M4 18 C 7 6, 15 6, 19 13", "M19 13 L14.5 12.5", "M19 13 L20 8.5"],
  rewrite: ["M6 6 H18", "M12 6 V18", "M4 12 H20"],
  undo: ["M9 6 L4 11 L9 16", "M4 11 H14 C18 11 20 13 20 18"],
  redo: ["M15 6 L20 11 L15 16", "M20 11 H10 C6 11 4 13 4 18"],
  settings: ["M12 9 A3 3 0 1 0 12.01 9", "M12 3 V6", "M12 18 V21", "M3 12 H6", "M18 12 H21", "M5.6 5.6 L7.8 7.8", "M16.2 16.2 L18.4 18.4", "M5.6 18.4 L7.8 16.2", "M16.2 7.8 L18.4 5.6"],
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "26");
  svg.setAttribute("height", "26");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  for (const d of PATHS[name] ?? []) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
