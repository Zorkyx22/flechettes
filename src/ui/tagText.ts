import type { LabelData } from "../overlay/types";
import { S } from "../strings";

/**
 * The lines of a tag: the class code on top, then gender and number ("f p") as a second, smaller
 * line. With no class, gender and number take the single line.
 */
export function tagLines(d: LabelData): { main: string; second: string | null } {
  const gn = [d.gender ? S.genderShort[d.gender] : null, d.number ? S.numberShort[d.number] : null]
    .filter((x): x is string => x !== null && x !== undefined)
    .join(" ");
  if (d.cls) return { main: S.classShort[d.cls] ?? "", second: gn === "" ? null : gn };
  return { main: gn, second: null };
}

/** "nom, féminin, pluriel" — spelled out for tooltips and screen readers. */
export function tagLong(d: LabelData): string {
  return [d.cls ? S.classLong[d.cls] : null, d.gender ? S.genderLong[d.gender] : null, d.number ? S.numberLong[d.number] : null]
    .filter((x): x is string => x !== null && x !== undefined)
    .join(", ");
}
