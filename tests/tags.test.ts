import { describe, expect, it } from "vitest";
import { tagLines, tagLong } from "../src/ui/tagText";

describe("tag lines", () => {
  it("puts the class code on top and gender/number on a smaller second line", () => {
    expect(tagLines({ cls: "nom", gender: "f", number: "p" })).toEqual({ main: "N", second: "f p" });
    expect(tagLines({ cls: "adjectif", number: "s" })).toEqual({ main: "Adj", second: "s" });
    expect(tagLines({ cls: "determinant", gender: "m" })).toEqual({ main: "Dét", second: "m" });
  });
  it("uses a single line for a class alone, or for gender/number alone", () => {
    expect(tagLines({ cls: "verbe" })).toEqual({ main: "V", second: null });
    expect(tagLines({ gender: "f", number: "p" })).toEqual({ main: "f p", second: null });
  });
  it("spells everything out for the tooltip", () => {
    expect(tagLong({ cls: "nom_propre", gender: "m", number: "s" })).toBe("nom propre, masculin, singulier");
  });
});
