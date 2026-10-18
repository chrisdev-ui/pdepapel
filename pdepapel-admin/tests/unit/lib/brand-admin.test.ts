import { describe, expect, it } from "vitest";

import {
  brandFlagToast,
  brandMoveBounds,
  canOfferLogoCopy,
  countBrandLines,
  flattenGroups,
  groupBrands,
  highlightTerm,
  logoCornersHaveBackground,
  mergeCandidates,
  mergeSummaryLines,
  moveBrand,
  moveItem,
  normalizeBrandOrder,
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
    expect(suggestionsHeading("Klipp", [{ reason: "coincide por el alias «Fashion»" }])).toBe("Encontré 1 producto para Klipp");
  });
});

describe("fusión", () => {
  it("resume lo que pasa antes de confirmar", () => {
    expect(mergeSummaryLines({ name: "Fashion", slug: "fashion", productCount: 3 }, { name: "Klipp", slug: "klipp" })).toEqual([
      "3 productos pasan de Fashion a Klipp",
      "Fashion queda archivada",
      "/marcas/fashion redirige a /marcas/klipp",
      "Los alias de Fashion se suman a Klipp (y «Fashion» queda como alias)",
    ]);
  });

  it("ofrece copiar el logo solo si A tiene y B no", () => {
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, { logoUrl: null })).toBe(true);
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, { logoUrl: "https://example.test/b.png" })).toBe(false);
    expect(canOfferLogoCopy({ logoUrl: null }, { logoUrl: null })).toBe(false);
    expect(canOfferLogoCopy({ logoUrl: "https://example.test/a.png" }, null)).toBe(false);
  });
});

const row = (id: string, parentBrandId: string | null = null, isArchived = false) => ({ id, parentBrandId, isArchived });
const ids = (list: { id: string }[]) => list.map((brand) => brand.id);

describe("mergeSummaryLines con líneas", () => {
  it("dice que las líneas pasan a la marca de destino", () => {
    expect(
      mergeSummaryLines({ name: "Primavera", slug: "primavera", productCount: 1, lineCount: 2 }, { name: "Kiut", slug: "kiut" }),
    ).toContain("2 líneas de Primavera pasan a ser de Kiut");
    expect(
      mergeSummaryLines({ name: "Primavera", slug: "primavera", productCount: 1, lineCount: 1 }, { name: "Kiut", slug: "kiut" }),
    ).toContain("1 línea de Primavera pasa a ser de Kiut");
    expect(mergeSummaryLines({ name: "A", slug: "a", productCount: 0, lineCount: 0 }, { name: "B", slug: "b" })).toHaveLength(4);
  });
});

describe("groupBrands", () => {
  it("deja cada línea debajo de su madre, en el orden en que llegó", () => {
    const list = [row("flor", "prima"), row("kiut"), row("prima"), row("otono", "prima"), row("mini", "kiut")];
    const groups = groupBrands(list);
    expect(groups.map((group) => [group.brand.id, ids(group.lines)])).toEqual([
      ["kiut", ["mini"]],
      ["prima", ["flor", "otono"]],
    ]);
    expect(ids(flattenGroups(groups))).toEqual(["kiut", "mini", "prima", "flor", "otono"]);
  });

  it("una línea sin su madre en la lista va como principal", () => {
    expect(ids(normalizeBrandOrder([row("a"), row("flor", "fuera")]))).toEqual(["a", "flor"]);
  });

  it("no pierde marcas con datos raros (dos niveles o madre ella misma)", () => {
    const list = [row("a"), row("b", "a"), row("c", "b"), row("d", "d")];
    expect(ids(normalizeBrandOrder(list)).sort()).toEqual(["a", "b", "c", "d"]);
    expect(ids(normalizeBrandOrder(list))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("normalizeBrandOrder", () => {
  it("tras arrastrar una línea fuera de su madre, la devuelve debajo y respeta su nuevo puesto entre hermanas", () => {
    const dragged = [row("l2", "p"), row("p"), row("q"), row("l1", "p")];
    expect(ids(normalizeBrandOrder(dragged))).toEqual(["p", "l2", "l1", "q"]);
  });

  it("tras arrastrar la madre, sus líneas la siguen", () => {
    const dragged = [row("l1", "p"), row("q"), row("p")];
    expect(ids(normalizeBrandOrder(dragged))).toEqual(["q", "p", "l1"]);
  });
});

describe("moveBrand", () => {
  const list = [row("a"), row("p"), row("l1", "p"), row("l2", "p"), row("z")];

  it("una principal se mueve con sus líneas entre las principales", () => {
    expect(ids(moveBrand(list, "p", -1))).toEqual(["p", "l1", "l2", "a", "z"]);
    expect(ids(moveBrand(list, "p", 1))).toEqual(["a", "z", "p", "l1", "l2"]);
    expect(ids(moveBrand(list, "a", 1))).toEqual(["p", "l1", "l2", "a", "z"]);
  });

  it("una línea solo cambia de puesto entre sus hermanas", () => {
    expect(ids(moveBrand(list, "l2", -1))).toEqual(["a", "p", "l2", "l1", "z"]);
    expect(ids(moveBrand(list, "l1", -1))).toEqual(ids(list));
    expect(ids(moveBrand(list, "l2", 1))).toEqual(ids(list));
  });

  it("un id que no está deja la lista igual", () => {
    expect(ids(moveBrand(list, "nadie", 1))).toEqual(ids(list));
  });
});

describe("brandMoveBounds", () => {
  const list = [row("a"), row("p"), row("l1", "p"), row("l2", "p")];

  it("apaga ↑ en la primera y ↓ en la última de su nivel", () => {
    expect(brandMoveBounds(list, "a")).toEqual({ up: false, down: true });
    expect(brandMoveBounds(list, "p")).toEqual({ up: true, down: false });
    expect(brandMoveBounds(list, "l1")).toEqual({ up: false, down: true });
    expect(brandMoveBounds(list, "l2")).toEqual({ up: true, down: false });
  });
});

describe("countBrandLines", () => {
  it("cuenta todas las líneas y las sin archivar", () => {
    const counts = countBrandLines([row("p"), row("l1", "p"), row("l2", "p", true), row("q")]);
    expect(counts.get("p")).toEqual({ total: 2, active: 1 });
    expect(counts.get("q")).toBeUndefined();
  });
});

describe("mergeCandidates", () => {
  const brands = [row("a"), row("b"), row("la", "a"), row("lb", "b"), row("x", null, true)];

  it("sin líneas: todas las activas menos ella misma (las líneas de otras sí)", () => {
    expect(ids(mergeCandidates({ id: "b", parentBrandId: null, activeLines: 0 }, brands.filter((brand) => brand.id !== "lb")))).toEqual([
      "a",
      "la",
    ]);
  });

  it("nunca una de sus propias líneas; con líneas activas, ninguna línea", () => {
    expect(ids(mergeCandidates({ id: "a", parentBrandId: null, activeLines: 1 }, brands))).toEqual(["b"]);
  });

  it("una línea puede fusionarse en cualquier activa", () => {
    expect(ids(mergeCandidates({ id: "la", parentBrandId: "a", activeLines: 0 }, brands))).toEqual(["a", "b", "lb"]);
  });
});
