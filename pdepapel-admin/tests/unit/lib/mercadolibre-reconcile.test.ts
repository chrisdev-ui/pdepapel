import { describe, expect, it } from "vitest";

import {
  computeReconcile,
  decidePriceMirror,
  type ReconcileListing,
  type ReconcileRemoteItem,
} from "@/lib/mercadolibre/reconcile";

const listing = (overrides: Partial<ReconcileListing> = {}): ReconcileListing => ({
  id: "l1",
  productId: "p1",
  productName: "Cartuchera Rosa",
  externalItemId: "MCO1",
  externalVariationId: null,
  externalUserProductId: "MCOU1",
  status: "ACTIVE",
  marketplacePrice: 39900,
  stockSafetyBuffer: 0,
  syncStock: true,
  syncPrice: true,
  productStock: 2,
  inPresale: false,
  ...overrides,
});

const item = (overrides: Partial<ReconcileRemoteItem> = {}): ReconcileRemoteItem => ({
  id: "MCO1",
  status: "active",
  subStatus: [],
  price: 39900,
  originalPrice: null,
  availableQuantity: 2,
  userProductId: "MCOU1",
  permalink: "https://ml/MCO1",
  ...overrides,
});

const run = (input: Partial<Parameters<typeof computeReconcile>[0]> = {}) =>
  computeReconcile({
    listings: [listing()],
    remote: [item()],
    unavailableItemIds: [],
    recentPaidOrderIds: [],
    knownOrderIds: [],
    ...input,
  });

const kinds = (result: ReturnType<typeof computeReconcile>) => result.issues.map((issue) => issue.kind);

describe("computeReconcile", () => {
  it("todo coincide: sin alertas ni arreglos", () => {
    const result = run();
    expect(result.issues).toEqual([]);
    expect(result.stockResyncProductIds).toEqual([]);
    expect(result.statusUpdates).toEqual([]);
    expect(result.userProductBackfill).toEqual([]);
  });

  it("stock distinto: vuelve a encolar la sincronización sin alerta", () => {
    const result = run({ remote: [item({ availableQuantity: 5 })] });
    expect(result.stockResyncProductIds).toEqual(["p1"]);
    expect(result.issues).toEqual([]);
  });

  it("respeta el colchón y la preventa al calcular el stock esperado", () => {
    expect(run({ listings: [listing({ stockSafetyBuffer: 1 })], remote: [item({ availableQuantity: 1 })] }).stockResyncProductIds).toEqual([]);
    expect(run({ listings: [listing({ inPresale: true })], remote: [item({ availableQuantity: 0 })] }).stockResyncProductIds).toEqual([]);
    expect(run({ listings: [listing({ syncStock: false })], remote: [item({ availableQuantity: 9 })] }).stockResyncProductIds).toEqual([]);
  });

  it("no toca el stock de un ítem cerrado ni de una variación antigua", () => {
    expect(run({ listings: [listing({ status: "CLOSED" })], remote: [item({ status: "closed", availableQuantity: 0 })] }).stockResyncProductIds).toEqual([]);
    expect(run({ listings: [listing({ externalVariationId: "v1" })], remote: [item({ availableQuantity: 9 })] }).stockResyncProductIds).toEqual([]);
  });

  it("precio distinto se reporta y nunca se cambia; una promoción no cuenta", () => {
    const changed = run({ remote: [item({ price: 45000 })] });
    expect(kinds(changed)).toEqual(["ml_price_mismatch"]);
    expect(changed.issues[0]).toMatchObject({ listingId: "l1", permalink: "https://ml/MCO1" });
    expect(run({ remote: [item({ price: 35900, originalPrice: 39900 })] }).issues).toEqual([]);
    expect(kinds(run({ remote: [item({ price: 35900, originalPrice: 42000 })] }))).toEqual(["ml_price_mismatch"]);
  });

  it("estado distinto: alinea el panel y avisa; la pausa por falta de stock se alinea sin aviso", () => {
    const paused = run({ remote: [item({ status: "paused", availableQuantity: 2 })] });
    expect(paused.statusUpdates).toEqual([{ externalItemId: "MCO1", status: "paused" }]);
    expect(kinds(paused)).toEqual(["ml_status_changed"]);

    const outOfStock = run({ listings: [listing({ productStock: 0 })], remote: [item({ status: "paused", subStatus: ["out_of_stock"], availableQuantity: 0 })] });
    expect(outOfStock.statusUpdates).toEqual([{ externalItemId: "MCO1", status: "paused" }]);
    expect(outOfStock.issues).toEqual([]);
  });

  it("en revisión o con moderación siempre avisa, aunque el panel ya diga pausada", () => {
    const review = run({ listings: [listing({ status: "PAUSED" })], remote: [item({ status: "under_review", subStatus: ["waiting_for_patch"] })] });
    expect(kinds(review)).toEqual(["ml_listing_review"]);
    expect(review.statusUpdates).toEqual([]);
  });

  it("guarda el producto de usuario que falta, sin alerta", () => {
    const result = run({ listings: [listing({ externalUserProductId: null })] });
    expect(result.userProductBackfill).toEqual([{ listingId: "l1", userProductId: "MCOU1" }]);
    expect(result.issues).toEqual([]);
  });

  it("gemelas: se comparan una vez por producto de usuario y no cuentan como sin vincular", () => {
    const agree = run({ remote: [item(), item({ id: "MCO2" })] });
    expect(agree.issues).toEqual([]);
    const disagree = run({ remote: [item(), item({ id: "MCO2", status: "paused" })] });
    expect(kinds(disagree)).toEqual(["ml_twin_mismatch"]);
    expect(disagree.issues[0].externalItemId).toBe("MCO2");
  });

  it("sin vincular con stock: solo activas con unidades; pausadas o cerradas no", () => {
    const remote = [
      item(),
      item({ id: "MCO8", userProductId: "MCOU8", availableQuantity: 3 }),
      item({ id: "MCO9", userProductId: "MCOU9", status: "paused", availableQuantity: 1 }),
      item({ id: "MCO10", userProductId: "MCOU10", status: "closed", availableQuantity: 4 }),
      item({ id: "MCO11", userProductId: "MCOU11", availableQuantity: 0 }),
    ];
    const result = run({ remote });
    expect(result.issues.map((issue) => [issue.kind, issue.externalItemId])).toEqual([["ml_unlinked_stock", "MCO8"]]);
  });

  it("venta pagada de las últimas 48 h que no llegó al panel", () => {
    const result = run({ recentPaidOrderIds: ["2000001", "2000002"], knownOrderIds: ["2000001"] });
    expect(result.issues.map((issue) => [issue.kind, issue.entityId])).toEqual([["ml_order_missing", "2000002"]]);
  });

  it("ítems que Mercado Libre no devolvió: una sola alerta «no revisado» y nada se arregla a ciegas", () => {
    const result = run({ remote: [], unavailableItemIds: ["MCO1"] });
    expect(kinds(result)).toEqual(["ml_unchecked"]);
    expect(result.stockResyncProductIds).toEqual([]);
    expect(result.statusUpdates).toEqual([]);
  });

  it("las alertas son estables: el mismo hallazgo da la misma huella", () => {
    const first = run({ remote: [item({ price: 45000 })] }).issues[0];
    const second = run({ remote: [item({ price: 45000 })] }).issues[0];
    const changed = run({ remote: [item({ price: 47000 })] }).issues[0];
    expect(first.fingerprintParts).toEqual(second.fingerprintParts);
    expect(changed.fingerprintParts).not.toEqual(first.fingerprintParts);
  });

  it("si la búsqueda de ventas falla, la revisión lo dice sin contarla como publicación", () => {
    const result = run({ ordersUnchecked: true });
    expect(kinds(result)).toEqual(["ml_unchecked"]);
    expect(result.issues[0].detail).toBe("Mercado Libre no respondió por las ventas de las últimas 48 horas; la revisión diaria lo vuelve a intentar mañana.");
    expect(run({ unavailableItemIds: ["MCO1", "MCO2"], remote: [], ordersUnchecked: true }).issues[0].detail).toContain("2 publicaciones ni por las ventas");
  });

  it("sincronización de precio apagada: el precio de Mercado Libre se propone para copiar, sin alerta", () => {
    const result = run({ listings: [listing({ syncPrice: false })], remote: [item({ price: 45000 })] });
    expect(result.issues).toEqual([]);
    expect(result.priceMirrors).toEqual([{ listingId: "l1", externalItemId: "MCO1", productId: "p1", from: 39900, to: 45000 }]);
  });

  it("sincronización de precio encendida: la diferencia se avisa y no se copia", () => {
    const result = run({ remote: [item({ price: 45000 })] });
    expect(kinds(result)).toEqual(["ml_price_mismatch"]);
    expect(result.priceMirrors).toEqual([]);
  });
});

describe("decidePriceMirror", () => {
  const targets = { targetMarginPercent: 20, minNetPerUnit: 10_000 };

  it("copia el precio si deja al menos el mayor entre el 20 % y 10.000 de neto", () => {
    expect(decidePriceMirror({ price: 60_000, unitCost: 20_000, feeAmount: 9_600, shippingCost: 8_200, targets })).toBe("mirror");
  });

  it("por debajo del piso no se copia: queda la alerta", () => {
    expect(decidePriceMirror({ price: 32_000, unitCost: 15_000, feeAmount: 5_120, shippingCost: 8_200, targets })).toBe("below_margin");
  });

  it("sin costo registrado no hay piso que medir: se copia", () => {
    expect(decidePriceMirror({ price: 32_000, unitCost: null, feeAmount: 5_120, shippingCost: 8_200, targets })).toBe("mirror");
  });
});
