import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  createSale: vi.fn(),
  charge: vi.fn(),
  undo: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner, CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } } }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: mocks.invalidate }));
vi.mock("@/lib/point-of-sale", () => ({
  POINT_OF_SALE_PAYMENT_METHODS: ["CASH", "BankTransfer", "Bold"],
  createPointOfSaleSale: mocks.createSale,
  chargePointOfSaleOnTerminal: mocks.charge,
  undoPointOfSaleSale: mocks.undo,
}));

import { ErrorFactory } from "@/lib/api-errors";
import { POST as postSale } from "@/app/api/[storeId]/point-of-sale/sales/route";
import { POST as postUndo } from "@/app/api/[storeId]/point-of-sale/sales/[orderId]/undo/route";

const sale = (body: unknown) =>
  postSale(new Request("https://admin.test/api/store-1/point-of-sale/sales", { method: "POST", body: JSON.stringify(body) }), { params: { storeId: "store-1" } });

/**
 * Vender: la venta acepta efectivo, transferencia y datáfono; con datáfono el
 * pedido nace pendiente y el cobro se manda a Bold en la misma petición.
 */
describe("POST /point-of-sale/sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
  });

  it("rejects a method outside cash, transfer and card terminal with a plain message", async () => {
    const response = await sale({ items: [{ productId: "p", quantity: 1 }], paymentMethod: "PayU", idempotencyKey: "k".repeat(12) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Elige efectivo, transferencia o datáfono" });
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("passes the transfer reference through and refreshes the caches after a paid sale", async () => {
    mocks.createSale.mockResolvedValue({ order: { id: "o-1", orderNumber: "V-1" }, duplicate: false, pending: false });
    const response = await sale({ items: [{ productId: "p", quantity: 1 }], paymentMethod: "BankTransfer", idempotencyKey: "k".repeat(12), transactionId: "REF-9" });
    expect(response.status).toBe(201);
    expect(mocks.createSale).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "BankTransfer", transactionId: "REF-9", userId: "owner" }));
    expect(mocks.invalidate).toHaveBeenCalledWith("store-1");
    expect(mocks.charge).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ pending: false, terminal: null });
  });

  it("sends a card-terminal sale to Bold and answers pending without touching the product caches", async () => {
    mocks.createSale.mockResolvedValue({ order: { id: "o-2", orderNumber: "V-2" }, duplicate: false, pending: true });
    mocks.charge.mockResolvedValue({ message: "Cobro enviado al datáfono" });
    const response = await sale({ items: [{ productId: "p", quantity: 1 }], paymentMethod: "Bold", idempotencyKey: "k".repeat(12) });
    expect(response.status).toBe(201);
    expect(mocks.charge).toHaveBeenCalledWith({ storeId: "store-1", orderId: "o-2" });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ pending: true, terminal: "Cobro enviado al datáfono" });
  });

  it("does not push to the terminal twice for a duplicated idempotency key", async () => {
    mocks.createSale.mockResolvedValue({ order: { id: "o-2", orderNumber: "V-2" }, duplicate: true, pending: true });
    const response = await sale({ items: [{ productId: "p", quantity: 1 }], paymentMethod: "Bold", idempotencyKey: "k".repeat(12) });
    expect(response.status).toBe(200);
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});

describe("POST /point-of-sale/sales/[orderId]/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
  });

  const undo = () =>
    postUndo(new Request("https://admin.test/api/store-1/point-of-sale/sales/o-1/undo", { method: "POST" }), { params: { storeId: "store-1", orderId: "o-1" } });

  it("is owner-only", async () => {
    mocks.verifyStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    const response = await undo();
    expect(response.status).toBe(403);
    expect(mocks.undo).not.toHaveBeenCalled();
  });

  it("restocks through the library and tells the owner the inventory came back", async () => {
    mocks.undo.mockResolvedValue({ order: { id: "o-1", orderNumber: "V-1", status: "CANCELLED" }, restocked: true, productIds: ["p"] });
    const response = await undo();
    expect(response.status).toBe(200);
    expect(mocks.undo).toHaveBeenCalledWith({ storeId: "store-1", orderId: "o-1", userId: "owner" });
    expect(mocks.invalidate).toHaveBeenCalledWith("store-1");
    await expect(response.json()).resolves.toMatchObject({ message: "Venta V-1 deshecha: el inventario volvió.", restocked: true });
  });

  it("answers 409 with the reason when the window passed", async () => {
    mocks.undo.mockRejectedValue(ErrorFactory.Conflict("Pasaron más de 30 minutos: registra la devolución desde Movimientos de inventario."));
    const response = await undo();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Pasaron más de 30 minutos") });
  });
});
