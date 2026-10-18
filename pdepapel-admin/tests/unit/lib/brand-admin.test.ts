import { describe, expect, it } from "vitest";

import {
  brandFlagToast,
  canOfferLogoCopy,
  highlightTerm,
  logoCornersHaveBackground,
  mergeSummaryLines,
  moveItem,
  sameOrder,
  selectAllState,
  suggestionsHeading,
} from "@/lib/brand-admin";

function rgba(width: number, height: number, alphaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alphaAt(x, y);
  }
  return data;
}

describe("moveItem", () => {
  it("sube y baja un puesto", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("en los extremos deja la lista igual y no la muta", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(list, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(list, 0, 1)).not.toBe(list);
    expect(list).toEqual(["a", "b"]);
  });

  it("sameOrder compara posición por posición", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});

describe("brandFlagToast", () => {
  it("el deshacer reenvía el valor anterior", () => {
    expect(brandFlagToast("Marca Prueba", "isFeatured", false)).toEqual({
      message: "Marca Prueba ya no sale en «Compra por marca».",
      undo: { isFeatured: true },
    });
    expect(brandFlagToast("Marca Prueba", "isVisible", true).undo).toEqual({ isVisible: false });
  });
});

describe("logoCornersHaveBackground", () => {
  it("un logo con esquinas transparentes no tiene fondo", () => {
    const data = rgba(4, 3, (x, y) => (x > 0 && x < 3 && y === 1 ? 255 : 0));
    expect(logoCornersHaveBackground(data, 4, 3)).toBe(false);
  });

  it("una sola esquina opaca basta para avisar", () => {
    const data = rgba(4, 3, (x, y) => (x === 3 && y === 2 ? 255 : 0));
    expect(logoCornersHaveBackground(data, 4, 3)).toBe(true);
  });

  it("semitransparente no cuenta como fondo", () => {
    expect(logoCornersHaveBackground(rgba(2, 2, () => 200), 2, 2)).toBe(false);
  });

  it("datos incompletos no dan falso aviso", () => {
    expect(logoCornersHaveBackground(new Uint8ClampedArray(4), 2, 2)).toBe(false);
  });
});

describe("highlightTerm", () => {
  const marked = (text: string, term: string) =>
    highlightTerm(text, term)
      .filter((segment) => segment.match)
      .map((segment) => segment.text);

  it("resalta sin mayúsculas ni tildes y conserva el texto original", () => {
    expect(marked("Libreta KIUT cosida", "Kiut")).toEqual(["KIUT"]);
    expect(marked("Cuaderno Pápelito azul", "papelito")).toEqual(["Pápelito"]);
    expect(highlightTerm("Libreta KIUT cosida", "Kiut").map((segment) => segment.text).join("")).toBe("Libreta KIUT cosida");
  });

  it("solo palabras completas", () => {
    expect(marked("Normandía y Norma", "Norma")).toEqual(["Norma"]);
    expect(marked("Kiuty", "Kiut")).toEqual([]);
  });

  it("términos de varias palabras y repetidos", () => {
    expect(marked("Kiut by Norma, kiut by norma", "Kiut by Norma")).toEqual(["Kiut by Norma", "kiut by norma"]);
  });

  it("sin término devuelve el texto entero", () => {
    expect(highlightTerm("Cuaderno", "")).toEqual([{ text: "Cuaderno", match: false }]);
  });
});

describe("selectAllState", () => {
  it("marcada, sin marcar o a medias", () => {
    expect(selectAllState(["a", "b"], new Set(["a", "b"]))).toBe(true);
    expect(selectAllState(["a", "b"], new Set(["x"]))).toBe(false);
    expect(selectAllState(["a", "b"], new Set(["a"]))).toBe("indeterminate");
    expect(selectAllState([], new Set())).toBe(false);
  });
});

describe("suggestionsHeading", () => {
  it("por el nombre cuando todas coinciden por el nombre", () => {
    expect(suggestionsHeading("Kiut", [{ reason: "coincide por el nombre" }, { reason: "coincide por el nombre" }])).toBe(
      "Encontré 2 productos que dicen «Kiut» en el nombre",
    );
  });

  it("para la marca cuando alguna llega por alias", () => {
    expect(suggestionsHeading("Scribe", [{ reason: "coincide por el alias «Incolors»" }])).toBe("Encontré 1 producto para Scribe");
  });
});

describe("fusión", () => {
  it("resume lo que pasa antes de confirmar", () => {
    expect(mergeSummaryLines({ name: "Incolors", slug: "incolors", productCount: 3 }, { name: "Scribe", slug: "scribe" })).toEqual([
      "3 productos pasan de Incolors a Scribe",
      "Incolors queda archivada",
      "/marcas/incolors redirige a /marcas/scribe",
      "Los alias de Incolors se suman a Scribe (y «Incolors» queda como alias)",
    ]);
  });

  it("ofrece copiar el logo solo si A tiene y B no", () => {
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, { logoUrl: null })).toBe(true);
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, { logoUrl: "https://example.test/b.png" })).toBe(false);
    expect(canOfferLogoCopy({ logoUrl: null }, { logoUrl: null })).toBe(false);
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, null)).toBe(false);
  });
});
