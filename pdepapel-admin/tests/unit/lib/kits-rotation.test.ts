import { describe, expect, it } from "vitest";

import {
  coPurchaseCounts,
  kindOf,
  priceKit,
  proposeKits,
  risingProducts,
  roundDown900,
  roundUp900,
  typeCoPurchaseCounts,
  type KitOptions,
  type KitPiece,
  type KitProduct,
  type KitSignals,
  kitDetail,
} from "@/lib/copiloto/kits-rotation";
import { summarizeDemand } from "@/lib/copiloto/skills/kits-tool";
import { effectiveUnitPrice, pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import { buildSalesHistory, newWithoutSalesData, rankSlowMovers, type SaleRow } from "@/lib/sales-velocity";
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
  stockedSince: daysAgo(400),
  unitCost: 2000,
  listPrice: 5000,
  effectivePrice: 5000,
  offerLabel: null,
  ...overrides,
});

const sale = (productId: string, days: number, quantity = 1, orderId: string | null = `o-${productId}-${days}`): SaleRow => ({ orderId, productId, quantity, at: daysAgo(days) });

const noSignals: KitSignals = { rising: new Map(), shownOnWhatsApp: new Map(), whatsAppTerms: [], occasions: [] };
const OPTIONS = { days: 90, kits: 3, minPerKit: 3, minMarginPct: 20, targetDiscountPct: 12 };

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

  it("lo que entró al inventario hace menos de la ventana no es lento: va como nuevo, aún sin datos de venta", () => {
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [], kits: [] });
    const products = [
      { ...product("vieja", { stockedSince: daysAgo(200) }) },
      { ...product("recien creada", { createdAt: daysAgo(10), stockedSince: daysAgo(10) }) },
      { ...product("creada hace mucho, primera entrada hace poco", { createdAt: daysAgo(300), stockedSince: daysAgo(15) }) },
      { ...product("nueva agotada", { stockedSince: daysAgo(5), stock: 0 }) },
    ];
    expect(rankSlowMovers(products, history).map((row) => row.id)).toEqual(["vieja"]);
    expect(newWithoutSalesData(products, history).map((row) => row.id)).toEqual(["recien creada", "creada hace mucho, primera entrada hace poco"]);
    const result = proposeKits({ products, history, together: () => 0, signals: noSignals, options: OPTIONS });
    expect(result.nuevos.map((row) => row.nombre)).toEqual(["recien creada", "creada hace mucho, primera entrada hace poco"]);
    expect(result.lentos.map((row) => row.id)).toEqual(["vieja"]);
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

  it("redondea hacia abajo a un precio terminado en 900", () => {
    expect(roundDown900(117656)).toBe(116900);
    expect(roundDown900(19272)).toBe(18900);
    expect(roundDown900(1899)).toBe(900);
    expect(roundDown900(899)).toBe(0);
    expect(roundUp900(18000)).toBe(18900);
    expect(roundUp900(18900)).toBe(18900);
  });

  it("descuento objetivo del 12 % sobre la suma de precios efectivos, con ahorro en pesos y %", () => {
    const pricing = priceKit(pieces([30000, 25000, 2000, 8000, 800], [57700, 50000, 5500, 18500, 2000]), 20, 12);
    expect(pricing).toMatchObject({ sum: 133700, price: 116900, ahorro: 16800, ahorroPct: 12.6, estado: "listo" });
    expect(priceKit(pieces([1000, 1000, 1000], [10000, 6000, 4000]), 20, 20)).toMatchObject({ price: 15900, ahorroPct: 20.5 });
  });

  it("si el costo no deja, usa el piso y dice que el descuento quedó limitado; nunca pasa de la suma", () => {
    const limited = priceKit(pieces([6000, 4000, 5000], [10000, 6000, 4000]), 20, 12);
    expect(limited).toMatchObject({ sum: 20000, floor: 18000, price: 18900, ahorroPct: 5.5, estado: "descuento limitado por costo" });
    expect(limited.price!).toBeLessThanOrEqual(limited.sum);
  });

  it("un ahorro menor al 5 % es «poco atractivo»; si ni el piso cabe, «no da el margen»", () => {
    expect(priceKit(pieces([6000, 5000, 5000], [10000, 6000, 4000]), 20, 12)).toMatchObject({ price: 19900, ahorroPct: 0.5, estado: "poco atractivo" });
    expect(priceKit(pieces([7000, 5000, 5000], [10000, 6000, 4000]), 20, 12)).toMatchObject({ price: null, estado: "no da el margen" });
  });

  it("sin costo de una pieza: precio con el descuento, sin margen ni piso", () => {
    expect(priceKit(pieces([3000, null, 3000], [8000, 8000, 8000]), 20, 12)).toMatchObject({ cost: null, floor: null, margin: null, sinCostoDe: ["Pieza 1"], estado: "sin costo", price: 20900 });
  });
});

describe("borradores de kits", () => {
  const OLD_ORDER = 120;
  const OLD_ORDERS = ["o-viejo-1", "o-viejo-2", "o-viejo-3"];
  const inOldOrders = (id: string) => OLD_ORDERS.map((order, index) => sale(id, OLD_ORDER + index * 10, 1, order));
  const scenario = (extra: KitProduct[] = []) => {
    const products = [
      product("Libreta lenta", { typeId: "cuadernos", typeName: "Cuadernos", stock: 8, unitCost: 4000, listPrice: 9000, effectivePrice: 9000 }),
      product("Lápiz que se vende", { typeId: "escritura", typeName: "Escritura", stock: 20 }),
      product("Borrador que se vende", { typeId: "utiles", typeName: "Útiles", stock: 20 }),
      product("Regla que se vende", { typeId: "oficina", typeName: "Oficina", stock: 20 }),
      product("Marcador en alza", { typeId: "colores", typeName: "Lápices & Colores", stock: 20 }),
      product("Marcadores x12 que se venden", { typeId: "colores", typeName: "Lápices & Colores", stock: 20 }),
      product("Otro cuaderno que se vende", { typeId: "cuadernos", typeName: "Cuadernos", stock: 20 }),
      ...extra,
    ];
    const sellers = products.slice(1).map((p) => p.id);
    const rows = [
      // Hace 120 a 140 días la libreta salió con todo en tres pedidos (sigue siendo lenta a 90 días, pero se sabe con qué se compra).
      ...OLD_ORDERS.flatMap((order, index) => ["Libreta lenta", ...sellers].map((id) => sale(id, OLD_ORDER + index * 10, 1, order))),
      ...sellers.map((id) => sale(id, 40)),
    ];
    return { products, rows };
  };
  const run = (products: KitProduct[], rows: SaleRow[], signals: KitSignals = noSignals, options: KitOptions = OPTIONS) => {
    const history = buildSalesHistory({ days: 90, now: NOW, rows, kits: [] });
    const orders = history.ordersSince(180);
    const typeById = new Map(products.map((p) => [p.id, p.typeId]));
    return proposeKits({
      products,
      history,
      together: coPurchaseCounts(orders).together,
      lines: typeCoPurchaseCounts(orders, (id) => typeById.get(id) ?? null),
      signals,
      options,
    });
  };

  it("una pieza por línea: sin dos marcadores ni otro cuaderno; prefiere la que va en alza", () => {
    const { products, rows } = scenario();
    const history = buildSalesHistory({ days: 90, now: NOW, rows: [...rows, sale("Marcador en alza", 5, 6)], kits: [] });
    const rising = risingProducts(products, history);
    const [kit] = run(products, [...rows, sale("Marcador en alza", 5, 6)], { ...noSignals, rising }).kits;
    const ids = kit.piezas.map((p) => p.productId);
    expect(ids[0]).toBe("Libreta lenta");
    expect(ids).toContain("Marcador en alza");
    expect(ids).not.toContain("Marcadores x12 que se venden");
    expect(ids).not.toContain("Otro cuaderno que se vende");
    const types = kit.piezas.map((p) => products.find((x) => x.id === p.productId)!.typeId);
    expect(new Set(types).size).toBe(types.length);
    expect(kit.piezas.length).toBeGreaterThanOrEqual(3);
  });

  it("precio terminado en 900, con ahorro de al menos 5 % y el descuento objetivo", () => {
    const { products, rows } = scenario();
    const [kit] = run(products, rows).kits;
    expect(kit.precioSugerido! % 1000).toBe(900);
    expect(kit.ahorroPct!).toBeGreaterThanOrEqual(5);
    expect(kit.descuentoObjetivoPct).toBe(12);
    expect(kit.precioSugerido!).toBeLessThanOrEqual(kit.sumaPreciosEfectivos);
  });

  it("dos productos con el mismo sustantivo no van juntos aunque sean de líneas distintas", () => {
    expect(kindOf({ name: "Cuaderno NORMA 5 materias", typeId: "a" }).noun).toBe("cuaderno");
    expect(kindOf({ name: "Cuadernos One Piece", typeId: "b" }).noun).toBe("cuaderno");
    expect(kindOf({ name: "Set de marcadores", typeId: "c" }).noun).toBe("marcador");
    const { products, rows } = scenario([product("Cuaderno de dibujo que se vende", { typeId: "arte", typeName: "Creatividad & Juego", stock: 20 })]);
    products[0] = { ...products[0], name: "Cuaderno lento" };
    const [kit] = run(products, [...rows, ...inOldOrders("Cuaderno de dibujo que se vende"), sale("Cuaderno de dibujo que se vende", 40)]).kits;
    expect(kit.piezas.map((p) => p.productId)).not.toContain("Cuaderno de dibujo que se vende");
  });

  it("sin compras en común ni líneas que salgan juntas, no hay kit", () => {
    const { products } = scenario();
    const rows = products.slice(1).map((p) => sale(p.id, 40));
    const result = run(products, rows);
    expect(result.kits).toEqual([]);
    expect(result.sinKit[0]).toMatchObject({ nombre: "Libreta lenta", motivo: expect.stringContaining("líneas afines") });
  });

  it("las líneas que salen juntas en tres o más pedidos, más que por azar, bastan aunque el producto lento no se haya comprado con ellas", () => {
    const { products } = scenario([product("Agenda que se vende", { typeId: "cuadernos", typeName: "Cuadernos", stock: 20 })]);
    const together = (orders: string[]) => orders.flatMap((order, index) => ["Agenda que se vende", "Lápiz que se vende", "Borrador que se vende"].map((id) => sale(id, 20 + index * 5, 1, order)));
    // El resto se vende por su lado, sin compartir pedido: no son lentos ni se relacionan.
    const apart = ["Regla que se vende", "Marcador en alza", "Marcadores x12 que se venden", "Otro cuaderno que se vende"].map((id) => sale(id, 40, 1, `o-${id}`));
    const [kit] = run(products, [...together(["o-a", "o-b", "o-c"]), ...apart]).kits;
    expect(kit.piezas.map((p) => p.productId)).toEqual(["Libreta lenta", "Borrador que se vende", "Lápiz que se vende"]);
    expect(kit.señales.join(" ")).toContain("su línea se compra junto con la de Libreta lenta (3 pedidos en 180 días)");
    // Dos pedidos no bastan: con tan pocos, juntos puede ser casualidad.
    expect(run(products, [...together(["o-a", "o-b"]), ...apart]).kits).toEqual([]);
  });

  it("líneas que salen juntas solo tanto como daría el azar (lift 1 o menos) no se relacionan", () => {
    const { products } = scenario([product("Agenda que se vende", { typeId: "cuadernos", typeName: "Cuadernos", stock: 20 })]);
    // Cuadernos y Escritura salen en todos los pedidos: juntas siempre, pero no más que por azar (lift 1).
    const rows = ["o-a", "o-b", "o-c", "o-d"].flatMap((order, index) => ["Agenda que se vende", "Lápiz que se vende", "Borrador que se vende"].map((id) => sale(id, 20 + index * 5, 1, order)));
    const lines = typeCoPurchaseCounts(buildSalesHistory({ days: 90, now: NOW, rows, kits: [] }).ordersSince(180), (id) => products.find((p) => p.id === id)!.typeId);
    expect(lines.together("cuadernos", "escritura")).toBe(4);
    expect(lines.lift("cuadernos", "escritura")).toBe(1);
    expect(run(products, rows).kits).toEqual([]);
  });

  it("un kit con ahorro menor al 5 % va a «poco atractivos» y no ocupa un lugar", () => {
    const { products, rows } = scenario();
    for (const p of products) p.unitCost = p.effectivePrice * 0.86;
    const result = run(products, rows);
    expect(result.kits).toEqual([]);
    expect(result.pocoAtractivos[0]).toMatchObject({ motivo: expect.stringMatching(/solo .* %|margen mínimo/) });
  });

  it("una ocasión cercana nombra el kit", () => {
    const { products, rows } = scenario();
    products[0] = { ...products[0], id: "Vela aromática lenta", name: "Vela aromática lenta", typeId: "regalos", typeName: "Regalos" };
    const fixed = rows.map((row) => (row.productId === "Libreta lenta" ? { ...row, productId: "Vela aromática lenta" } : row));
    const occasions = upcomingOccasions(new Date("2026-04-20T15:00:00Z"), 45);
    // Las familias se pueden pasar: aquí «Regalos» va con la papelería.
    const families = { regalo: ["Regalos", "Escritura", "Útiles", "Oficina", "Lápices & Colores"] };
    const [kit] = run(products, fixed, { ...noSignals, occasions }, { ...OPTIONS, families }).kits;
    expect(kit.ocasion).toMatch(/^Día de la madre \(en 20 días\)$/);
    expect(kit.señales).toContain("temporada: Día de la madre el 2026-05-10");
  });

  it("una pieza en oferta entra con su precio efectivo", () => {
    const { products, rows } = scenario();
    products[1] = { ...products[1], effectivePrice: 4000, offerLabel: "20 %" };
    const [kit] = run(products, rows).kits;
    expect(kit.piezas.find((p) => p.productId === "Lápiz que se vende")).toMatchObject({ precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" });
    expect(kit.sumaPreciosEfectivos).toBe(kit.piezas.reduce((total, p) => total + p.precioEfectivo, 0));
  });

  it("una pieza que se vende por menos de $1.000 no entra; el mínimo se puede cambiar", () => {
    const { products, rows } = scenario();
    products[1] = { ...products[1], effectivePrice: 900, listPrice: 900 };
    const [kit] = run(products, rows).kits;
    expect(kit.piezas.map((p) => p.productId)).not.toContain("Lápiz que se vende");
    expect(kit.piezas.every((p) => p.rol === "lento" || p.precioEfectivo >= 1000)).toBe(true);
    const [cheapAllowed] = run(products, rows, noSignals, { ...OPTIONS, minSellerValue: 500 }).kits;
    expect(cheapAllowed.piezas.map((p) => p.productId)).toContain("Lápiz que se vende");
    const [strict] = run(products, rows, noSignals, { ...OPTIONS, minSellerValue: 5001 }).kits ?? [];
    expect(strict).toBeUndefined();
  });

  it("no usa kits, archivados ni piezas sin stock para K kits; sin lentos no propone nada", () => {
    const { products, rows } = scenario([
      product("Kit que se vende", { isKit: true, typeId: "kits", stock: 20 }),
      product("Archivado que se vende", { isArchived: true, typeId: "archivo", stock: 20 }),
      product("Poco stock que se vende", { typeId: "poco", stock: 2 }),
    ]);
    const extraRows = ["Kit que se vende", "Archivado que se vende", "Poco stock que se vende"].flatMap((id) => [...inOldOrders(id), sale(id, 10)]);
    const [kit] = run(products, [...rows, ...extraRows]).kits;
    const ids = kit.piezas.map((p) => p.productId);
    expect(ids).not.toContain("Kit que se vende");
    expect(ids).not.toContain("Archivado que se vende");
    expect(ids).not.toContain("Poco stock que se vende");
    expect(run(products, [...rows, ...extraRows, sale("Libreta lenta", 10)])).toMatchObject({ lentos: [], kits: [] });
  });

  describe("calidad de los borradores", () => {
    const carpeta = product("Carpeta lenta", { typeId: "carpetas", typeName: "Carpetas", stock: 8, unitCost: 2000, listPrice: 9000, effectivePrice: 9000 });
    /** El escenario más un lento que no tiene ventas recientes (las piezas extra de `scenario` sí se venden). */
    const withSlow = (slowProduct: KitProduct, extra: KitProduct[] = []) => {
      const base = scenario(extra);
      return { products: [...base.products, slowProduct], rows: base.rows };
    };
    const carpetaOrders = (ids: string[]) => ["o-c1", "o-c2", "o-c3"].flatMap((order, index) => ["Carpeta lenta", ...ids].map((id) => sale(id, 100 + index * 10, 1, order)));

    it("una pieza en dos borradores reparte su stock: la suma de kits armables no pasa de su disponible, y cada uno lo dice", () => {
      const { products, rows } = withSlow(carpeta);
      products.find((p) => p.id === "Borrador que se vende")!.stock = 9;
      const result = run(products, [...rows, ...carpetaOrders(["Borrador que se vende", "Regla que se vende"])]);
      expect(result.kits).toHaveLength(2);
      const users = result.kits.filter((kit) => kit.piezas.some((p) => p.productId === "Borrador que se vende"));
      expect(users).toHaveLength(2);
      expect(users.reduce((total, kit) => total + kit.kitsArmables, 0)).toBeLessThanOrEqual(9);
      for (const kit of users) {
        const other = result.kits.find((candidate) => candidate !== kit)!.nombreSugerido;
        expect(kit.piezas.find((p) => p.productId === "Borrador que se vende")!.comparteStockCon).toEqual([other]);
      }
      // Sin repartir, cada uno diría 8.
      expect(result.kits.map((kit) => kit.kitsArmables)).toEqual([4, 4]);
    });

    it("prefiere una pieza que nadie usa y solo repite si no hay otra; si el reparto no alcanza, el borrador sale", () => {
      const tijeras = product("Tijeras que se venden", { typeId: "utiles", typeName: "Útiles", stock: 20 });
      const { products, rows } = withSlow(carpeta, [tijeras]);
      const result = run(products, [...rows, sale("Tijeras que se venden", 40), ...carpetaOrders(["Tijeras que se venden", "Regla que se vende"])]);
      expect(result.kits).toHaveLength(2);
      // Hay dos piezas de Útiles: cada kit lleva una distinta. La regla no tiene otra de su línea: se repite y lo dice.
      const utiles = result.kits.map((kit) => kit.piezas.find((p) => ["Tijeras que se venden", "Borrador que se vende"].includes(p.productId))!);
      expect(new Set(utiles.map((p) => p.productId)).size).toBe(2);
      expect(utiles.every((p) => !p.comparteStockCon)).toBe(true);
      expect(result.kits.every((kit) => kit.piezas.find((p) => p.productId === "Regla que se vende")?.comparteStockCon?.length === 1)).toBe(true);

      const { products: few, rows: fewRows } = withSlow(carpeta);
      few.find((p) => p.id === "Borrador que se vende")!.stock = 5;
      const short = run(few, [...fewRows, ...carpetaOrders(["Borrador que se vende", "Regla que se vende"])]);
      expect(short.kits.every((kit) => kit.kitsArmables >= 3)).toBe(true);
      expect(short.sinKit.some((row) => /stock repartido no alcanza/.test(row.motivo))).toBe(true);
    });

    it("nunca usa como pieza algo de la línea de kits, aunque no esté marcado como kit", () => {
      const bundle = product("Kit kawaii x 5 que se vende", { typeId: "kits", typeName: "Kits", categoryName: "Kits kawaii", stock: 20 });
      const bundleSlow = product("Kit lento de la línea", { typeId: "kits", typeName: "Kits", categoryName: "Kits kawaii", stock: 9, unitCost: 9000, effectivePrice: 20000, listPrice: 20000 });
      const { products, rows } = withSlow(bundleSlow, [bundle]);
      const result = run(products, [...rows, ...inOldOrders("Kit kawaii x 5 que se vende"), sale("Kit kawaii x 5 que se vende", 10), ...inOldOrders("Kit lento de la línea")]);
      const pieces = result.kits.flatMap((kit) => kit.piezas.map((p) => p.productId));
      expect(pieces).not.toContain("Kit kawaii x 5 que se vende");
      expect(pieces).not.toContain("Kit lento de la línea");
      expect(result.lentos.map((row) => row.id)).toContain("Kit lento de la línea");
      expect(result.sinKit.map((row) => row.nombre)).not.toContain("Kit lento de la línea");
    });

    it("solo junta líneas de una misma familia: un jabón que se compra con la libreta no entra a un kit escolar", () => {
      const jabon = product("Jabón que se vende", { typeId: "belleza", typeName: "Belleza / Cuidado Personal", stock: 20, effectivePrice: 7000, listPrice: 7000 });
      const { products, rows } = scenario([jabon]);
      const withJabon = [...rows, ...inOldOrders("Jabón que se vende"), sale("Jabón que se vende", 40)];
      const lines = typeCoPurchaseCounts(buildSalesHistory({ days: 90, now: NOW, rows: withJabon, kits: [] }).ordersSince(180), (id) => products.find((p) => p.id === id)!.typeId);
      expect(lines.together("cuadernos", "belleza")).toBe(3);
      expect(lines.lift("cuadernos", "belleza")).toBeGreaterThan(1);
      const [kit] = run(products, withJabon).kits;
      expect(kit.piezas.map((p) => p.productId)).not.toContain("Jabón que se vende");
      expect(kit.piezas.length).toBeGreaterThanOrEqual(3);
    });

    it("una pieza lenta de una línea sin familia no arma kit y la línea se reporta", () => {
      const { products, rows } = scenario();
      products[0] = { ...products[0], typeId: "hogar", typeName: "Hogar" };
      const result = run(products, rows);
      expect(result.kits).toEqual([]);
      expect(result.lineasSinFamilia).toEqual(["Hogar"]);
      expect(result.sinKit[0].motivo).toContain("no está en ninguna familia");
    });

    it("una pieza lenta tiene que valer: si es barata va a «bajo valor» y no a un kit (los dos topes se pueden cambiar)", () => {
      const sobre = product("Sobre lento", { typeId: "oficina-2", typeName: "Oficina", stock: 90, unitCost: 300, effectivePrice: 500, listPrice: 500 });
      const { products, rows } = scenario();
      products[0] = { ...sobre, id: "Libreta lenta", name: "Sobre lento" };
      const cheap = run(products, rows);
      expect(cheap.kits).toEqual([]);
      expect(cheap.bajoValor).toEqual([{ nombre: "Sobre lento", precioEfectivo: 500 }]);
      expect(run(products, rows, noSignals, { ...OPTIONS, minSlowValue: 400, minSlowSharePct: 1 }).kits).toHaveLength(1);

      const { products: normal, rows: normalRows } = scenario();
      expect(run(normal, normalRows).kits).toHaveLength(1);
      // Con un tope del 40 % de la suma, la libreta de 9.000 en un kit de unos 29.000 ya no carga el kit.
      const heavy = run(normal, normalRows, noSignals, { ...OPTIONS, minSlowSharePct: 40 });
      expect(heavy.kits).toEqual([]);
      expect(heavy.bajoValor.map((row) => row.nombre)).toEqual(["Libreta lenta"]);
    });
  });

  it("WhatsApp entra solo como cuentas y solo si se repite", () => {
    const { products, rows } = scenario();
    const signals: KitSignals = { ...noSignals, shownOnWhatsApp: new Map([["Regla que se vende", 3]]), whatsAppTerms: [{ termino: "lapiz", veces: 4, sinResultados: 1 }] };
    const [kit] = run(products, rows, signals).kits;
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

describe("detalle fijo de un borrador", () => {
  const base = {
    nombreSugerido: "Kit de grados con Libreta",
    ocasion: null,
    piezas: [
      { productId: "a", nombre: "Libreta", rol: "lento" as const, disponible: 8, precioEfectivo: 6000, precioDeLista: 6000, oferta: null, costo: 3000 },
      { productId: "b", nombre: "Lápiz", rol: "se vende" as const, disponible: 20, precioEfectivo: 4000, precioDeLista: 5000, oferta: "Regreso a clases", costo: 1000 },
      { productId: "c", nombre: "Regla", rol: "se vende" as const, disponible: 9, precioEfectivo: 2500, precioDeLista: 2500, oferta: null, costo: 800 },
    ],
    kitsArmables: 8,
    sumaPreciosEfectivos: 12500,
    costoTotal: 4800,
    precioMinimo: 5900,
    precioSugerido: 10900,
    ahorroParaLaClienta: 1600,
    ahorroPct: 12.8,
    descuentoObjetivoPct: 12,
    margenPct: 56,
    sinCostoDe: [],
    estado: "listo" as const,
    señales: ["Lápiz: «lapiz» se pidió 2 veces por WhatsApp en 30 días"],
  };

  it("trae cada pieza con su precio efectivo y la oferta, las cuentas y un porqué por pieza, sangrado bajo el nombre del kit", () => {
    expect(kitDetail(base)).toBe(
      [
        "  - Libreta (lento): $6.000",
        "  - Lápiz (se vende): $4.000 con la oferta «Regreso a clases» (antes $5.000)",
        "  - Regla (se vende): $2.500",
        "  - Se pueden armar 8 · suma de precios efectivos $12.500 · precio sugerido $10.900 · margen 56 % · ahorro $1.600 (12,8 %).",
        "  - Por qué:",
        "    - Lápiz: «lapiz» se pidió 2 veces por WhatsApp en 30 días",
      ].join("\n"),
    );
  });

  it("una pieza que comparte stock con otro borrador lo dice en su línea", () => {
    const shared = { ...base, piezas: base.piezas.map((p) => (p.productId === "c" ? { ...p, comparteStockCon: ["Kit de oficina"] } : p)) };
    expect(kitDetail(shared)).toContain("  - Regla (se vende): $2.500 · comparte stock con «Kit de oficina»");
  });

  it("sin costo no muestra margen y lo dice; el descuento limitado por costo también se explica", () => {
    const sinCosto = kitDetail({ ...base, margenPct: null, costoTotal: null, precioMinimo: null, sinCostoDe: ["Regla"], estado: "sin costo" });
    expect(sinCosto).not.toMatch(/margen \d/);
    expect(sinCosto).toContain("Sin costo de Regla");
    expect(kitDetail({ ...base, estado: "descuento limitado por costo" })).toContain("por debajo del 12 % porque el costo no deja bajar más");
  });
});
