import { describe, expect, it } from "vitest";

import { analyzeBelowMargin, type MarginProduct } from "@/lib/pricing/below-margin";
import { buildMarkupResolver, markupMap, median, type MarkupCategory, type MarkupSampleProduct } from "@/lib/pricing/category-markup";
import { packLadder, packMixes, packScenarios, recommendSizes } from "@/lib/pricing/packs";
import {
  DEFAULT_MARKUP_PCT,
  landedCost,
  marginOnPrice,
  mercadoLibreEstimate,
  priceToReachMargin,
  suggestStorePrice,
} from "@/lib/pricing/price-calculator";
import { roundDown900, roundUp900 } from "@/lib/pricing/rounding";

describe("costo, precio sugerido y margen", () => {
  it("el costo suma el envío por unidad solo si es real; sin costo de compra no hay costo", () => {
    expect(landedCost(160, 20)).toBe(180);
    expect(landedCost(160, null)).toBe(160);
    expect(landedCost(160, 1000)).toBe(160);
    expect(landedCost(160, 0)).toBe(160);
    expect(landedCost(null, 20)).toBeNull();
    expect(landedCost(0, 20)).toBeNull();
  });

  it("el precio sugerido aumenta el costo con envío y redondea al peso", () => {
    expect(suggestStorePrice(180, 100)).toBe(360);
    expect(suggestStorePrice(333, 85)).toBe(616);
    expect(suggestStorePrice(null, 100)).toBe(0);
    expect(suggestStorePrice(0, 100)).toBe(0);
  });

  it("el precio para llegar a un margen sube al peso y lo alcanza", () => {
    expect(priceToReachMargin(6500, 35)).toBe(10000);
    expect(priceToReachMargin(6501, 35)).toBe(10002);
    const price = priceToReachMargin(487, 40)!;
    expect((price - 487) / price).toBeGreaterThanOrEqual(0.4);
    expect((price - 1 - 487) / (price - 1)).toBeLessThan(0.4);
    expect(priceToReachMargin(1000, 100)).toBeNull();
    expect(priceToReachMargin(0, 35)).toBeNull();
    expect(marginOnPrice(10000, 6500)).toBe(35);
  });

  it("redondeo a …900 hacia abajo y hacia arriba", () => {
    expect(roundDown900(15200)).toBe(14900);
    expect(roundDown900(21600)).toBe(20900);
    expect(roundUp900(25412)).toBe(25900);
  });
});

describe("Mercado Libre, siempre estimado", () => {
  it("sin los dos ajustes no suma cargo fijo y lo dice", () => {
    expect(mercadoLibreEstimate(8000, 1500, { lowPriceFixedFee: null, freeShippingMin: null })).toEqual({
      price: 8000,
      commission: 1280,
      fixedFee: 0,
      shipping: 8100,
      withholding: 120,
      net: -3000,
      marginPct: -37.5,
      withoutFixedFee: true,
    });
  });

  it("con los ajustes, por debajo del umbral suma el cargo fijo; desde el umbral no", () => {
    const settings = { lowPriceFixedFee: 900, freeShippingMin: 60000 };
    expect(mercadoLibreEstimate(30000, 10000, settings)).toMatchObject({ fixedFee: 900, withoutFixedFee: false, net: 30000 - 4800 - 900 - 8100 - 450 - 10000 });
    expect(mercadoLibreEstimate(60000, 10000, settings)).toMatchObject({ fixedFee: 0, withoutFixedFee: false });
  });
});

describe("aumento sugerido por categoría", () => {
  const categories: MarkupCategory[] = [
    { id: "cuadernos", name: "Cuadernos", typeId: "papeleria", typeName: "Papelería", markupOverridePercent: null },
    { id: "agendas", name: "Agendas", typeId: "papeleria", typeName: "Papelería", markupOverridePercent: null },
    { id: "stickers", name: "Stickers", typeId: "decoracion", typeName: "Decoración", markupOverridePercent: null },
    { id: "propia", name: "Propia", typeId: "decoracion", typeName: "Decoración", markupOverridePercent: 120 },
  ];
  const product = (categoryId: string | null, price: number, acqPrice: number | null, transportationCost: number | null = null, isKit = false): MarkupSampleProduct => ({
    categoryId,
    price,
    acqPrice,
    transportationCost,
    isKit,
  });
  // Cuadernos: cinco productos con aumentos 50, 60, 80, 100, 150 → mediana 80.
  const cuadernos = [150, 160, 180, 200, 250].map((price) => product("cuadernos", price, 100));
  // Agendas: dos productos (menos de 5) → sube a Papelería (cinco de Cuadernos + dos de Agendas).
  const agendas = [product("agendas", 300, 100), product("agendas", 400, 100)];
  // Lo que nunca cuenta: un kit, uno sin costo y uno por debajo del costo.
  const ignored = [product("cuadernos", 900, 100, null, true), product("cuadernos", 900, null), product("cuadernos", 90, 100)];

  it("la mediana de la categoría con al menos 5 productos, sin kits, sin costo ni por debajo del costo", () => {
    const resolve = buildMarkupResolver([...cuadernos, ...agendas, ...ignored], categories);
    expect(resolve("cuadernos")).toEqual({ markupPct: 80, kind: "categoria", source: "mediana de Cuadernos (5 productos)" });
  });

  it("con menos de 5 sube al tipo; sin datos del tipo, a la tienda; sin nada, el 100 % de siempre", () => {
    const resolve = buildMarkupResolver([...cuadernos, ...agendas], categories);
    expect(resolve("agendas")).toEqual({ markupPct: 100, kind: "tipo", source: "mediana de Papelería (7 productos; Agendas tiene menos de 5)" });
    expect(resolve("stickers")).toEqual({ markupPct: 100, kind: "tienda", source: "mediana de la tienda (7 productos); Stickers y Decoración tienen menos de 5" });
    expect(resolve(null)).toEqual({ markupPct: 100, kind: "tienda", source: "mediana de la tienda (7 productos)" });
    expect(buildMarkupResolver([], categories)("stickers")).toEqual({
      markupPct: DEFAULT_MARKUP_PCT,
      kind: "defecto",
      source: "100 % por defecto (no hay productos con costo para comparar)",
    });
  });

  it("el definido por Paula gana sobre la mediana", () => {
    const resolve = buildMarkupResolver([...cuadernos, ...cuadernos.map((item) => ({ ...item, categoryId: "propia" }))], categories);
    expect(resolve("propia")).toEqual({ markupPct: 120, kind: "propio", source: "definido por ti para Propia" });
  });

  it("el envío por unidad entra al costo de la mediana", () => {
    const withShipping = [150, 160, 180, 200, 250].map((price) => product("cuadernos", price, 80, 20));
    expect(buildMarkupResolver(withShipping, categories)("cuadernos").markupPct).toBe(80);
  });

  it("el mapa de la ficha trae cada categoría y la de «sin categoría»", () => {
    const map = markupMap(cuadernos, categories);
    expect(Object.keys(map.byCategory)).toEqual(["cuadernos", "agendas", "stickers", "propia"]);
    expect(map.fallback.kind).toBe("tienda");
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});

describe("packs: el caso de 150 unidades a 150 (valores de prueba)", () => {
  const prices = packLadder({ sizes: [30, 10, 20], given: { 10: 8000 } });
  const scenarios = packScenarios({ prices, unitCost: 150, packaging: null, available: 150 });

  it("la escalera: x20 = 14.900 y x30 = 20.900", () => {
    expect(prices).toEqual([
      { size: 10, price: 8000, fromLadder: false },
      { size: 20, price: 14900, fromLadder: true },
      { size: 30, price: 20900, fromLadder: true },
    ]);
  });

  it("ganancia, unidades por pack y lo que alcanza el stock", () => {
    expect(scenarios.map((s) => [s.size, s.profit, s.profitPct, s.unitPrice, s.unitDiscountPct, s.packs, s.leftover, s.totalProfit])).toEqual([
      [10, 6500, 81.3, 800, null, 15, 0, 97500],
      [20, 11900, 79.9, 745, 6.9, 7, 10, 83300],
      [30, 16400, 78.5, 697, 12.9, 5, 0, 82000],
    ]);
  });

  it("con pocos packs recomienda los dos más pequeños y arma tres mezclas sin sobrante", () => {
    const recommended = recommendSizes(scenarios);
    expect(recommended).toEqual([10, 20]);
    expect(packMixes(scenarios, recommended, 150)).toEqual([
      { kind: "mayor-ganancia", counts: [{ size: 10, packs: 15 }], leftover: 0, totalProfit: 97500 },
      { kind: "mitad-y-mitad", counts: [{ size: 10, packs: 7 }, { size: 20, packs: 4 }], leftover: 0, totalProfit: 93100 },
      { kind: "menos-packs", counts: [{ size: 10, packs: 1 }, { size: 20, packs: 7 }], leftover: 0, totalProfit: 89800 },
    ]);
  });

  it("con costo de empaque la ganancia baja empaque × packs", () => {
    const withPackaging = packScenarios({ prices, unitCost: 150, packaging: 300, available: 150 });
    expect(withPackaging.map((s) => s.totalProfit)).toEqual([97500 - 300 * 15, 83300 - 300 * 7, 82000 - 300 * 5]);
  });

  it("Paula puede dar el precio de cualquier tamaño; los menores pagan menos descuento", () => {
    expect(packLadder({ sizes: [10, 20, 30], given: { 20: 15000, 30: 21000 } })).toEqual([
      { size: 10, price: 7900, fromLadder: true },
      { size: 20, price: 15000, fromLadder: false },
      { size: 30, price: 21000, fromLadder: false },
    ]);
    expect(() => packLadder({ sizes: [10, 20], given: {} })).toThrow("al menos un tamaño");
  });

  it("con stock de sobra recomienda los dos que más ganan en total", () => {
    const many = packScenarios({ prices, unitCost: 150, packaging: null, available: 600 });
    expect(recommendSizes(many)).toEqual([10, 20]);
  });
});

describe("productos por debajo de un margen", () => {
  const product = (id: string, categoryName: string | null, price: number, acqPrice: number | null, transportationCost: number | null = null, isKit = false): MarginProduct => ({
    id,
    name: `Producto ${id}`,
    categoryName,
    price,
    acqPrice,
    transportationCost,
    isKit,
  });
  const products = [
    product("a", "Cuadernos", 10000, 6000, 500), // costo 6.500 → 35 %
    product("b", "Cuadernos", 9000, 6000), // 33,3 %
    product("c", "Cuadernos", 20000, 6000), // 70 %
    product("d", "Stickers", 1000, 700), // 30 %
    product("e", null, 5000, 4000), // 20 %
    product("kit", "Cuadernos", 30000, null, null, true),
    product("sin-costo", "Stickers", 3000, null),
  ];

  it("por umbral y categoría, con el precio al peso que llega al margen y lo que hay que subir", () => {
    const result = analyzeBelowMargin(products, [40, 35]);
    expect(result).toMatchObject({ evaluados: 5, sinCosto: 1, kits: 1 });
    const [at35, at40] = result.porUmbral;
    expect(at35.margenPct).toBe(35);
    expect(at35.debajo).toBe(3);
    expect(at35.categorias.map((c) => [c.categoria, c.debajo, c.evaluados])).toEqual([
      ["Cuadernos", 1, 3],
      ["Sin categoría", 1, 1],
      ["Stickers", 1, 1],
    ]);
    expect(at35.categorias[0].productos[0]).toEqual({ id: "b", nombre: "Producto b", precio: 9000, costo: 6000, margenPct: 33.3, precioNecesario: 9231, subida: 231 });
    expect(at40.debajo).toBe(4);
    expect(at40.categorias[0]).toMatchObject({ categoria: "Cuadernos", debajo: 2, evaluados: 3 });
    // Primero lo que más hay que subir.
    expect(at40.categorias[0].productos.map((p) => [p.id, p.precioNecesario, p.subida])).toEqual([
      ["b", 10000, 1000],
      ["a", 10834, 834],
    ]);
  });
});
