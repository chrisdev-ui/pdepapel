import { describe, expect, it } from "vitest";

import { detectLicense } from "@/lib/capsule-licenses";
import {
  buildThemes,
  isSafeCopy,
  missingProducts,
  pickCapsuleFloor,
  rejectionPair,
  SUGGESTION_RULES,
  suggestBagForEdition,
  suggestEditions,
  suggestionCopy,
  trimBagToMargin,
  type SuggestionProduct,
} from "@/lib/capsule-suggestions";
import { CAPSULE_PACK_PRICES, maxPackFor } from "@/lib/pricing/capsules";

const OPTIONS = CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? 2000 : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, boxReserveCost: 1500 }));

let seq = 0;
function product(overrides: Partial<SuggestionProduct> & { design?: string; category?: string } = {}): SuggestionProduct {
  seq += 1;
  const { design = "otro", category = "Cuadernos", ...rest } = overrides;
  return {
    id: `p${String(seq).padStart(3, "0")}`,
    name: `Producto ${seq}`,
    unitCost: 4000,
    available: 6,
    daysSinceLastSale: 120,
    daysInStock: 300,
    attributes: { design: { id: design, name: design[0].toUpperCase() + design.slice(1) }, category: { id: category.toLowerCase(), name: category } },
    categoryName: category,
    onMercadoLibre: false,
    licenseBlocked: false,
    ...rest,
  };
}

/** 12 kawaii entre 3 200 y 5 000, 12 vintage entre 3 500 y 5 500, y 20 de otros diseños sueltos para que ninguno pase del 40 %. */
function catalog() {
  seq = 0;
  const kawaii = Array.from({ length: 12 }, (_, i) => product({ design: "kawaii", unitCost: 3200 + i * 150, available: 5 + (i % 3) }));
  const vintage = Array.from({ length: 12 }, (_, i) => product({ design: "vintage", unitCost: 3500 + i * 160, available: 6, category: i % 2 ? "Libretas" : "Stickers" }));
  const others = Array.from({ length: 20 }, (_, i) => product({ design: `suelto-${i}`, unitCost: 4000 }));
  return [...kawaii, ...vintage, ...others];
}

describe("temas", () => {
  it("salen de los datos: fuera los de menos de 8 productos y los que cubren más del 40 %", () => {
    seq = 0;
    const generic = Array.from({ length: 30 }, () => product({ design: "clasico" }));
    const kawaii = Array.from({ length: 10 }, () => product({ design: "kawaii" }));
    const few = Array.from({ length: 5 }, () => product({ design: "gatito" }));
    const keys = buildThemes([...generic, ...kawaii, ...few]).map((theme) => theme.key);
    expect(keys).toContain("design:kawaii");
    expect(keys).not.toContain("design:clasico");
    expect(keys).not.toContain("design:gatito");
  });
});

describe("ediciones sugeridas", () => {
  it("cumplen la banda, la bolsa y el margen de todos los packs que caben", () => {
    const suggestions = suggestEditions({ products: catalog(), options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 });
    expect(suggestions.map((s) => s.themeKey).sort()).toEqual(["design:kawaii", "design:vintage"]);
    for (const suggestion of suggestions) {
      expect(suggestion.costBandMax / suggestion.costBandMin).toBeLessThanOrEqual(SUGGESTION_RULES.maxBandRatio);
      expect(suggestion.slips).toBeGreaterThanOrEqual(SUGGESTION_RULES.minSlips);
      expect(suggestion.slips).toBeLessThanOrEqual(SUGGESTION_RULES.maxSlips);
      expect(suggestion.products).toBeGreaterThanOrEqual(SUGGESTION_RULES.minProducts);
      expect(suggestion.bag.reduce((sum, line) => sum + line.quantity, 0)).toBe(suggestion.slips);
      for (const line of suggestion.bag) {
        expect(line.quantity).toBeLessThanOrEqual(suggestion.slips * SUGGESTION_RULES.maxProductShare);
        expect(line.quantity).toBeLessThanOrEqual(line.available);
        expect(line.unitCost).toBeGreaterThanOrEqual(suggestion.costBandMin);
        expect(line.unitCost).toBeLessThanOrEqual(suggestion.costBandMax);
        expect(line.reason).toMatch(/días sin venta · cabe en la banda · tema /);
      }
      expect(suggestion.maxPack).toBe(maxPackFor(suggestion.slips));
      const measured = suggestion.packs.filter((pack) => pack.available);
      expect(measured.length).toBeGreaterThan(0);
      expect(measured.every((pack) => pack.passes === true)).toBe(true);
      expect(isSafeCopy(`${suggestion.name} ${suggestion.pitch}`)).toBe(true);
    }
  });

  it("no repiten productos entre ediciones y salen iguales dos veces seguidas", () => {
    const products = catalog();
    const first = suggestEditions({ products, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 });
    const ids = first.flatMap((s) => s.bag.map((line) => line.productId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(suggestEditions({ products, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 })).toEqual(first);
  });

  it("no propone nada que no pase el margen", () => {
    const expensive = catalog().map((p) => ({ ...p, unitCost: p.unitCost * 3 }));
    expect(suggestEditions({ products: expensive, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 })).toEqual([]);
  });

  it("nunca incluye productos con licencia pendiente ni más baratos que el piso de un papel", () => {
    const products = catalog();
    const blocked = new Set(products.filter((p) => p.attributes.design?.id === "kawaii").slice(0, 3).map((p) => p.id));
    const cheap = products.find((p) => p.attributes.design?.id === "vintage")!;
    const marked = products.map((p) => (blocked.has(p.id) ? { ...p, licenseBlocked: true } : p.id === cheap.id ? { ...p, unitCost: 2500 } : p));
    const ids = suggestEditions({ products: marked, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 }).flatMap((s) => s.bag.map((line) => line.productId));
    expect(ids.some((id) => blocked.has(id))).toBe(false);
    expect(ids).not.toContain(cheap.id);
  });
});

describe("los ✗ de Paula", () => {
  it("un tema rechazado no vuelve a salir y un producto rechazado sale de la bolsa de ese tema", () => {
    const products = catalog();
    const first = suggestEditions({ products, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 });
    const kawaii = first.find((s) => s.themeKey === "design:kawaii")!;
    const dropped = kawaii.bag[0].productId;
    const again = suggestEditions({
      products,
      options: OPTIONS,
      minMarginPct: 20,
      minSlipCost: 3000,
      rejections: { themes: new Set(["design:vintage"]), pairs: new Set([rejectionPair("design:kawaii", dropped)]) },
    });
    expect(again.map((s) => s.themeKey)).toEqual(["design:kawaii"]);
    expect(again[0].bag.map((line) => line.productId)).not.toContain(dropped);
  });
});

describe("«Te faltan estos»", () => {
  it("lista los quietos fuera de las sugerencias; los de menos del piso, para regalo; sin licencia pendiente", () => {
    seq = 100;
    const lonely = product({ design: "kawaii", unitCost: 1500 });
    const blocked = { ...product({ design: "kawaii" }), licenseBlocked: true };
    const groups = missingProducts({ products: [...catalog(), lonely, blocked], suggestions: [], minSlipCost: 3000 });
    const rows = groups.flatMap((group) => group.products);
    expect(rows.find((row) => row.productId === lonely.id)).toMatchObject({ gift: true, reason: "120 días sin venta · para regalo" });
    expect(rows.some((row) => row.productId === blocked.id)).toBe(false);
  });
});

describe("«Sugerir bolsa» en una edición", () => {
  it("usa la banda de la edición y cuenta lo ya impreso para el tope por producto", () => {
    const products = catalog().filter((p) => p.attributes.design?.id === "kawaii");
    const printed = new Map([[products[11].id, 6]]);
    const bag = suggestBagForEdition({ products, themeKey: "design:kawaii", costBandMin: 3200, costBandMax: 4500, printed });
    const total = bag.reduce((sum, line) => sum + line.quantity, 0) + 6;
    for (const line of bag) {
      expect(line.unitCost).toBeLessThanOrEqual(4500);
      expect(line.quantity + (printed.get(line.productId) ?? 0)).toBeLessThanOrEqual(Math.floor(total * SUGGESTION_RULES.maxProductShare));
    }
    expect(bag.some((line) => line.productId === products[11].id && line.quantity > 0 && line.quantity + 6 > Math.floor(total * 0.2))).toBe(false);
  });
});

describe("textos", () => {
  it("rechazan dinero, azar y promesas de valor", () => {
    for (const text of ["Vale $20.000", "12.900 en cápsulas", "Prueba tu suerte", "Gana un premio", "Sorteo kawaii", "Vale más de lo que pagas", "30 pesos"]) {
      expect(isSafeCopy(text), text).toBe(false);
    }
    expect(isSafeCopy("48 cápsulas con 10 productos de diseño Kawaii: cuadernos, stickers.")).toBe(true);
  });

  it("si el tema trae una palabra prohibida, el texto cae a uno neutro", () => {
    const copy = suggestionCopy({ key: "design:x", kind: "design", label: "Premios" }, 40, 8, ["Cuadernos"]);
    expect(copy).toEqual({ name: "Edición sugerida", theme: "sugerida", pitch: "40 cápsulas con 8 productos distintos." });
  });
});

describe("licencias", () => {
  it("detecta personajes conocidos sin tildes ni mayúsculas, como palabra entera", () => {
    expect(detectLicense(["Cuaderno HELLO KITTY Pequeño"])).toBe("hello kitty");
    expect(detectLicense(["Libreta", "Pokémon"])).toBe("pokemon");
    expect(detectLicense(["Lápiz infinito Gatito de Cats Diary"])).toBeNull();
    expect(detectLicense(["Botsy azul"])).toBeNull();
    expect(detectLicense([null, undefined, ""])).toBeNull();
  });
});

describe("piso de las cápsulas", () => {
  it("manda la edición, luego el margen de cápsulas, luego el de la tienda", () => {
    expect(pickCapsuleFloor({ editionFloor: 55, capsuleFloor: 50, storeFloor: 35 })).toEqual({ value: 55, source: "edition" });
    expect(pickCapsuleFloor({ editionFloor: null, capsuleFloor: 50, storeFloor: 35 })).toEqual({ value: 50, source: "capsules" });
    expect(pickCapsuleFloor({ editionFloor: null, capsuleFloor: null, storeFloor: 35 })).toEqual({ value: 35, source: "store" });
    expect(pickCapsuleFloor({ editionFloor: undefined, capsuleFloor: null, storeFloor: null })).toBeNull();
    expect(pickCapsuleFloor({ editionFloor: 0, capsuleFloor: 50, storeFloor: 35 })).toEqual({ value: 0, source: "edition" });
  });

  it("una edición que pasa con el margen de la tienda y no con el de cápsulas no se sugiere a ese piso", () => {
    const products = catalog().map((p) => ({ ...p, unitCost: p.unitCost * 2 }));
    const atStore = suggestEditions({ products, options: OPTIONS, minMarginPct: 20, minSlipCost: 3000 });
    expect(atStore.length).toBeGreaterThan(0);
    expect(suggestEditions({ products, options: OPTIONS, minMarginPct: 50, minSlipCost: 3000 })).toEqual([]);
  });

  it("«Sugerir bolsa» recorta los más caros hasta que cada pack que cabe pasa el piso", () => {
    seq = 200;
    const cheap = Array.from({ length: 8 }, (_, i) => ({ productId: `b${i}`, name: `B${i}`, categoryName: null, unitCost: 3000, available: 6, quantity: 6, reason: "" }));
    const dear = { productId: "caro", name: "Caro", categoryName: null, unitCost: 11000, available: 6, quantity: 6, reason: "" };
    const trimmed = trimBagToMargin({ bag: [...cheap, dear], printedCosts: [], options: OPTIONS, minMarginPct: 50 });
    expect(trimmed.map((line) => line.productId)).not.toContain("caro");
    expect(trimmed).toHaveLength(8);
    expect(trimBagToMargin({ bag: cheap, printedCosts: [], options: OPTIONS, minMarginPct: 50 })).toEqual(cheap);
  });
});
