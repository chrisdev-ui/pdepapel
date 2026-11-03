import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { GA4_API_SECRET: "secret", GA4_MEASUREMENT_ID: "G-TEST" } as Record<string, string | undefined>,
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({ default: { order: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));

import {
  buildCodRefundBody,
  recordCancelledCodOrderInGoogleAnalytics,
  recordCodOrderInGoogleAnalytics,
  recordPaidOrderInGoogleAnalytics,
} from "@/lib/google-analytics";

const codOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "o-1",
  orderNumber: "ORD-9",
  status: "PENDING",
  total: 44997,
  analyticsClientId: "123456789.987654321",
  analyticsSessionId: "1791180000",
  analyticsPurchaseTrackedAt: null,
  analyticsRefundTrackedAt: null,
  coupon: null,
  payment: { method: "COD" },
  shipping: { cost: 13997, status: "Preparing" },
  paymentPlan: "FULL",
  payments: [],
  orderItems: [{ name: "Cuaderno", price: 31000, brandName: null, product: { category: { name: "Cuadernos" }, sku: "CUA-1" }, productId: "p-1", quantity: 1, sku: "CUA-1" }],
  ...overrides,
});

let sent: Array<{ events: Array<{ name: string; params: Record<string, unknown> }> }>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 });
  sent = [];
  fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("contra entrega en GA4: la compra al crear el pedido", () => {
  it("reclama la marca antes de mandar, manda purchase con payment_type cod y deja los ids para un reembolso", async () => {
    mocks.findUnique.mockResolvedValue(codOrder());
    await expect(recordCodOrderInGoogleAnalytics("o-1")).resolves.toBe("sent");

    const [claim] = mocks.updateMany.mock.calls;
    expect(claim[0].where).toEqual({ id: "o-1", analyticsPurchaseTrackedAt: null });
    expect(claim[0].data).toEqual({ analyticsPurchaseTrackedAt: expect.any(Date) });
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(sent[0].events[0]).toMatchObject({ name: "purchase", params: { payment_type: "cod", transaction_id: "ORD-9", value: 44997, shipping: 13997 } });
    expect(mocks.updateMany.mock.calls.some(([args]) => "analyticsClientId" in args.data)).toBe(false);
  });

  it("si otra llamada ya la reclamó, no manda nada", async () => {
    mocks.findUnique.mockResolvedValue(codOrder());
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(recordCodOrderInGoogleAnalytics("o-1")).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si GA4 falla, suelta la marca para poder reintentar", async () => {
    mocks.findUnique.mockResolvedValue(codOrder());
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(recordCodOrderInGoogleAnalytics("o-1")).rejects.toThrow("500");
    const release = mocks.updateMany.mock.calls[1][0];
    expect(release.data).toEqual({ analyticsPurchaseTrackedAt: null });
    expect(release.where.analyticsPurchaseTrackedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["no es contra entrega", { payment: { method: "BankTransfer" } }],
    ["sin consentimiento (sin client id)", { analyticsClientId: null }],
    ["ya medida", { analyticsPurchaseTrackedAt: new Date() }],
    ["cancelado", { status: "CANCELLED" }],
  ])("no manda nada si %s", async (_label, overrides) => {
    mocks.findUnique.mockResolvedValue(codOrder(overrides));
    await expect(recordCodOrderInGoogleAnalytics("o-1")).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("sin credenciales de GA4 no lee ni escribe nada", async () => {
    mocks.env.GA4_API_SECRET = undefined;
    try {
      await expect(recordCodOrderInGoogleAnalytics("o-1")).resolves.toBe("skipped");
      expect(mocks.findUnique).not.toHaveBeenCalled();
    } finally {
      mocks.env.GA4_API_SECRET = "secret";
    }
  });
});

describe("contra entrega en GA4: el reembolso al cancelar antes de entregar", () => {
  const tracked = { analyticsPurchaseTrackedAt: new Date("2026-11-01T12:00:00Z") };

  it("manda refund una vez, marca analyticsRefundTrackedAt y borra los ids", async () => {
    mocks.findUnique.mockResolvedValue(codOrder({ ...tracked, status: "CANCELLED" }));
    await expect(recordCancelledCodOrderInGoogleAnalytics("o-1")).resolves.toBe("sent");
    expect(sent[0]).toMatchObject({ client_id: "123456789.987654321", events: [{ name: "refund", params: { transaction_id: "ORD-9", value: 44997, currency: "COP" } }] });
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "o-1", analyticsRefundTrackedAt: null } });
    expect(mocks.updateMany.mock.calls.at(-1)![0].data).toEqual({ analyticsClientId: null, analyticsSessionId: null });
  });

  it.each([
    ["ya entregado", { ...tracked, status: "CANCELLED", shipping: { cost: 0, status: "Delivered" } }],
    ["el reembolso ya salió (pedido reactivado y vuelto a cancelar)", { ...tracked, status: "CANCELLED", analyticsRefundTrackedAt: new Date() }],
    ["la compra nunca se midió", { status: "CANCELLED" }],
    ["no está cancelado", { ...tracked, status: "SENT" }],
  ])("no manda nada si %s", async (_label, overrides) => {
    mocks.findUnique.mockResolvedValue(codOrder(overrides));
    await expect(recordCancelledCodOrderInGoogleAnalytics("o-1")).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("antes de borrar arma el reembolso aunque el pedido no esté cancelado", async () => {
    mocks.findUnique.mockResolvedValue(codOrder({ ...tracked, status: "PENDING" }));
    const body = await buildCodRefundBody("o-1", { beforeDelete: true });
    expect(body?.events[0]).toMatchObject({ name: "refund", params: { transaction_id: "ORD-9" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("contra entrega cobrado al entregar", () => {
  it("la compra ya salió al crear: no la manda otra vez, solo borra los ids", async () => {
    mocks.findUnique.mockResolvedValue(codOrder({ status: "PAID", analyticsPurchaseTrackedAt: new Date() }));
    await expect(recordPaidOrderInGoogleAnalytics("o-1")).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "o-1" }, data: { analyticsClientId: null, analyticsSessionId: null } });
  });
});
