import { describe, expect, it } from "vitest";

import { coPurchaseCounts, priceKit, proposeKits, risingProducts, roundBelow, type KitPiece, type KitProduct, type KitSignals } from "@/lib/copiloto/kits-rotation";
import { summarizeDemand } from "@/lib/copiloto/skills/kits-tool";
import { effectiveUnitPrice, pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import { buildSalesHistory, rankSlowMovers, type SaleRow } from "@/lib/sales-velocity";
import { upcomingOccasions } from "@/lib/season-calendar";

const NOW = new Date("2026-10-14T15:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const product = (id: string, overrides: Partial<KitProduct> = {}): KitProduct => ({
  id,
  name: id,
  categoryId: "cat-utiles",
  categoryName: "Útiles",
  typeId: "type-papeleria",
  typeName: "Papelería",
  isKit: false,
  isArchived: false,
  stock: 10,
  reservedUnits: 0,
  createdAt: daysAgo(400),
  unitCost: 2000,
  listPrice: 5000,
  effectivePrice: 5000,
  offerLabel: null,
  ...overrides,
});

const sale = (productId: string, days: number, quantity = 1, orderId: string | null = `o-${productId}-${days}`): SaleRow => ({ orderId, productId, quantity, at: daysAgo(days) });

const noSignals: KitSignals = { rising: new Map(), shownOnWhatsApp: new Map(), whatsAppTerms: [], occasions: [] };
const OPTIONS = { days: 90, kits: 3, minPerKit: 3, minMarginPct: 20 };

describe("precio efectivo (misma regla que la tienda)", () => {
  const offers: ActiveOffer[] = [
    { id: "a", label: "10 %", type: "PERCENTAGE", amount: 10, products: [], categories: [{ categoryId: "cat" }], productGroups: [] },
    { id: "b", label: "-2.000", type: "FIXED", amount: 2000, products: [{ productId: "p" }], categories: [], productGroups: [] },
    { id: "c", label: null, type: "PERCENTAGE", amount: 50, products: [], categories: [], productGroups: [{ productGroupId: "g" }] },
  ];

  it("toma la oferta que deja el precio más bajo, por producto, categoría o grupo", () => {
    expect(pickBestOffer({ id: "p", price: 10000, categoryId: "cat", productGroupId: null }, offers)).toMatchObject({ price: 8000, matchedOfferId: "b", offerLabel: "-2.000" });
    expect(pickBestOffer({ id: "x", price: 10000, categoryId: "cat", productGroupId: "g" }, offers)).toMatchObject({ price: 5000, matchedOfferId: "c", offerLabel: null });
    expect(pickBestOffer({ id: "y", price: 10000, categoryId: "otra", productGroupId: null }, offers)).toMatchObject({ price: 10000, discount: 0, matchedOfferId: null });
  });

  it("la escalera por cantidad gana si deja menos que la oferta", () => {
    const priced = { id: "p", price: 10000, categoryId: "cat", productGroupId: null };
    const offer = pickBestOffer(priced, offers);
    expect(effectiveUnitPrice({ product: priced, offer, tiers: [{ minQuantity: 1, unitPrice: 7000 }], quantity: 1 })).toMatchObject({ unitPrice: 7000, source: "tier" });
    expect(effectiveUnitPrice({ product: priced, offer, tiers: [], quantity: 1 })).toMatchObject({ unitPrice: 8000, source: "offer" });
  });
});

describe("producto lento (una sola regla)", () => {
  const kits = [{ id: "kit", components: [{ componentId: "pieza", quantity: 2 }] }];

  it("lo vendido dentro de un kit cuenta para la pieza: una pieza que solo sale en kits no es lenta", () => {
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [sale("kit", 20, 3)], kits });
    expect(history.get("pieza")).toMatchObject({ sold30: 6, soldInWindow: 6, soldInWindowViaKits: 6 });
    expect(history.get("pieza").lastSaleAt).toEqual(daysAgo(20));
    expect(rankSlowMovers([{ ...product("pieza") }], history)).toEqual([]);
  });

  it("separa 30 días de los 30 anteriores y respeta la ventana pedida", () => {
    const history = buildSalesHistory({ days: 120, now: NOW, rows: [sale("a", 10, 4), sale("a", 45, 1), sale("a", 100, 2)], kits: [] });
    expect(history.get("a")).toMatchObject({ sold30: 4, previous30: 1, soldInWindow: 7 });
  });

  it("excluye kits, archivados y lo que no tiene disponible (reservado todo); ordena por plata quieta a costo", () => {
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [sale("vieja", 200)], kits: [] });
    const rows = rankSlowMovers(
      [
        { ...product("barata", { stock: 10, unitCost: 1000 }) },
        { ...product("cara", { stock: 5, unitCost: 5000 }) },
        { ...product("sinCosto", { unitCost: null }) },
        { ...product("vieja", { stock: 2, unitCost: 100 }) },
        { ...product("kit", { isKit: true }) },
        { ...product("archivado", { isArchived: true }) },
        { ...product("reservada", { stock: 4, reservedUnits: 4 }) },
      ],
      history,
    );
    expect(rows.map((row) => row.id)).toEqual(["cara", "barata", "vieja", "sinCosto"]);
    expect(rows[0]).toMatchObject({ available: 5, tiedUpAtCost: 25000, daysSinceLastSale: null });
    expect(rows.find((row) => row.id === "vieja")).toMatchObject({ daysSinceLastSale: 200 });
    expect(rows.at(-1)).toMatchObject({ tiedUpAtCost: null });
  });

  it("«se compran juntos» sale de los mismos pedidos", () => {
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [sale("a", 10, 1, "o1"), sale("b", 10, 1, "o1"), sale("a", 300, 1, "o2"), sale("c", 300, 1, "o2")], kits: [] });
    const { together } = coPurchaseCounts(history.ordersSince(180));
    expect(together("a", "b")).toBe(1);
    expect(together("a", "c")).toBe(0);
  });
});

describe("calendario de Colombia", () => {
  const names = (iso: string, days = 45) => upcomingOccasions(new Date(iso), days).map((occasion) => `${occasion.id}:${occasion.fecha}:${occasion.enDias}`);

  it("calcula las fechas móviles y cuenta los días desde hoy en Bogotá", () => {
    expect(names("2026-10-14T15:00:00Z")).toEqual(["halloween:2026-10-31:17", "grados:2026-11-25:42"]);
    expect(names("2026-04-20T15:00:00Z", 30)).toEqual(["dia-del-idioma:2026-04-23:3", "dia-del-nino:2026-04-25:5", "dia-de-la-madre:2026-05-10:20", "dia-del-maestro:2026-05-15:25"]);
    expect(names("2026-09-01T15:00:00Z", 30)).toContain("amor-y-amistad:2026-09-19:18");
    expect(names("2026-12-20T15:00:00Z", 35)).toEqual(["navidad:2026-12-24:4", "regreso-a-clases-enero:2027-01-20:31"]);
  });

  it("entre fines de junio y julio no hay ocasión en 45 días", () => {
    expect(names("2026-06-25T15:00:00Z")).toEqual([]);
  });
});

describe("precio del kit", () => {
  const pieces = (costs: (number | null)[], prices: number[]): KitPiece[] =>
    prices.map((price, index) => ({ productId: `p${index}`, nombre: `Pieza ${index}`, rol: "se vende", disponible: 5, precioEfectivo: price, precioDeLista: price, oferta: null, costo: costs[index] }));

  it("redondo justo por debajo de la suma", () => {
    expect(roundBelow(23400)).toBe(23000);
    expect(roundBelow(24000)).toBe(23000);
    expect(roundBelow(12300)).toBe(12000);
    expect(roundBelow(12000)).toBe(11500);
  });

  it("nunca por encima de la suma ni por debajo de costo + margen", () => {
    expect(priceKit(pieces([3000, 3000, 3000], [8000, 8000, 7400]), 20)).toMatchObject({ sum: 23400, cost: 9000, floor: 10800, price: 23000, estado: "listo" });
    expect(priceKit(pieces([3000, 3000, 3000], [8000, 8000, 7400]), 20).margin).toBeCloseTo(60.9, 1);
    const tight = priceKit(pieces([3800, 3800, 3800], [4500, 4500, 4500]), 20);
    expect(tight).toMatchObject({ sum: 13500, floor: 13680, price: null, estado: "no da el margen" });
    const exact = priceKit(pieces([3500, 3500, 3500], [4500, 4500, 4500]), 20);
    expect(exact).toMatchObject({ floor: 12600, price: 13000, estado: "listo" });
    expect(exact.price!).toBeLessThanOrEqual(exact.sum);
  });

  it("sin costo de una pieza: lo dice y no calcula margen", () => {
    expect(priceKit(pieces([3000, null, 3000], [8000, 8000, 8000]), 20)).toMatchObject({ cost: null, floor: null, margin: null, sinCostoDe: ["Pieza 1"], estado: "sin costo", price: 23000 });
  });
});

describe("borradores de kits", () => {
  const base = () => {
    const products = [
      product("Libreta lenta", { stock: 8, unitCost: 4000 }),
      product("Lápiz que se vende", { stock: 20 }),
      product("Borrador que se vende", { stock: 20 }),
      product("Regla que se vende", { stock: 20 }),
      product("Marcador en alza", { stock: 20 }),
      product("Otra categoría", { categoryId: "cat-oficina", typeId: "type-oficina", stock: 20 }),
    ];
    const rows = ["Lápiz que se vende", "Borrador que se vende", "Regla que se vende", "Marcador en alza", "Otra categoría"].map((id) => sale(id, 40));
    return { products, rows };
  };

  it("junta el lento con piezas relacionadas que se venden y prefiere la que va en alza", () => {
    const { products, rows } = base();
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [...rows, sale("Marcador en alza", 5, 6), sale("Marcador en alza", 45, 1)], kits: [] });
    const rising = risingProducts(products, history);
    expect(Array.from(rising.keys())).toEqual(["Marcador en alza"]);
    const result = proposeKits({ products, history, together: () => 0, signals: { ...noSignals, rising }, options: { ...OPTIONS, kits: 1 } });
    expect(result.lentos.map((row) => row.id)).toEqual(["Libreta lenta"]);
    const [kit] = result.kits;
    expect(kit.piezas[0]).toMatchObject({ productId: "Libreta lenta", rol: "lento" });
    expect(kit.piezas[1]).toMatchObject({ productId: "Marcador en alza", rol: "se vende" });
    expect(kit.piezas.map((p) => p.productId)).not.toContain("Otra categoría");
    expect(kit.piezas.length).toBeGreaterThanOrEqual(3);
    expect(kit.piezas.length).toBeLessThanOrEqual(5);
    expect(kit.señales.join(" ")).toContain("en alza: 6 unidades en 30 días contra 2 antes");
    expect(kit.kitsArmables).toBe(8);
  });

  it("una ocasión cercana nombra el kit", () => {
    const products = [
      product("Vela aromática lenta", { stock: 8 }),
      product("Taza que se vende", { stock: 10 }),
      product("Sticker que se vende", { stock: 10 }),
      product("Tarjeta que se vende", { stock: 10 }),
    ];
    const history = buildSalesHistory({ days: 90, now: NOW, rows: products.slice(1).map((p) => sale(p.id, 40)), kits: [] });
    const occasions = upcomingOccasions(new Date("2026-04-20T15:00:00Z"), 45);
    const [kit] = proposeKits({ products, history, together: () => 0, signals: { ...noSignals, occasions }, options: OPTIONS }).kits;
    expect(kit.ocasion).toMatch(/^Día de la madre \(en 20 días\)$/);
    expect(kit.señales).toContain("temporada: Día de la madre el 2026-05-10");
  });

  it("una pieza en oferta entra con su precio efectivo", () => {
    const { products, rows } = base();
    products[1] = { ...products[1], effectivePrice: 4000, offerLabel: "20 %" };
    const history = buildSalesHistory({ days: 90, now: NOW, rows, kits: [] });
    const [kit] = proposeKits({ products, history, together: () => 0, signals: noSignals, options: OPTIONS }).kits;
    const onOffer = kit.piezas.find((p) => p.productId === "Lápiz que se vende")!;
    expect(onOffer).toMatchObject({ precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" });
    expect(kit.sumaPreciosEfectivos).toBe(kit.piezas.reduce((total, p) => total + p.precioEfectivo, 0));
    expect(kit.precioSugerido!).toBeLessThanOrEqual(kit.sumaPreciosEfectivos);
  });

  it("no usa kits, archivados ni piezas sin stock para K kits; sin lentos no propone nada", () => {
    const { products, rows } = base();
    products.push(product("Kit que se vende", { isKit: true, stock: 20 }), product("Archivado que se vende", { isArchived: true, stock: 20 }), product("Poco stock que se vende", { stock: 2 }));
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [...rows, sale("Kit que se vende", 10), sale("Archivado que se vende", 10), sale("Poco stock que se vende", 10)], kits: [] });
    const [kit] = proposeKits({ products, history, together: () => 0, signals: noSignals, options: OPTIONS }).kits;
    expect(kit.piezas.map((p) => p.productId)).not.toEqual(expect.arrayContaining(["Kit que se vende"]));
    expect(kit.piezas.map((p) => p.productId)).not.toContain("Archivado que se vende");
    expect(kit.piezas.map((p) => p.productId)).not.toContain("Poco stock que se vende");

    const allSelling = buildSalesHistory({ days: 90, now: NOW, rows: [...rows, sale("Libreta lenta", 10), sale("Poco stock que se vende", 10)], kits: [] });
    expect(proposeKits({ products, history: allSelling, together: () => 0, signals: noSignals, options: OPTIONS })).toMatchObject({ lentos: [], kits: [] });
  });

  it("WhatsApp entra solo como cuentas y solo si se repite", () => {
    const { products, rows } = base();
    const history = buildSalesHistory({ days: 90, now: NOW, rows, kits: [] });
    const signals: KitSignals = { ...noSignals, shownOnWhatsApp: new Map([["Regla que se vende", 3]]), whatsAppTerms: [{ termino: "lapiz", veces: 4, sinResultados: 1 }] };
    const [kit] = proposeKits({ products, history, together: () => 0, signals, options: OPTIONS }).kits;
    const text = kit.señales.join(" | ");
    expect(text).toContain("el bot lo enseñó 3 veces por WhatsApp en 30 días");
    expect(text).toContain("«lapiz» se pidió 4 veces por WhatsApp en 30 días");
  });
});

describe("demanda por WhatsApp (vista CopilotBotDemand)", () => {
  it("cuenta términos y productos enseñados, descarta lo que aparece una vez y nunca guarda texto libre", () => {
    const summary = summarizeDemand([
      { productType: "Cartuchera", characterName: "Kuromi", found: 2, shownProductIds: '["p1","p2"]' },
      { productType: "cartuchera", characterName: null, found: 0, shownProductIds: ["p1"] },
      { productType: "agenda 2027", characterName: null, found: BigInt(0), shownProductIds: null },
      { productType: "<script>", characterName: "x", found: 1, shownProductIds: null },
      { productType: "null", characterName: "null", found: 0, shownProductIds: null },
      { productType: "null", characterName: null, found: 0, shownProductIds: null },
    ]);
    expect(summary.terms).toEqual([{ termino: "cartuchera", veces: 2, sinResultados: 1 }]);
    expect(Array.from(summary.shown)).toEqual([["p1", 2]]);
  });
});
