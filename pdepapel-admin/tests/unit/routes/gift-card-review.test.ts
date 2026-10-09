import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  issue: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } }, verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findFirst: mocks.findFirst },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ order: { updateMany: mocks.updateMany } }),
  },
}));
vi.mock("@/lib/gift-cards", () => ({ issueGiftCardForOrder: mocks.issue }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: mocks.deliver }));

import { POST } from "@/app/api/[storeId]/orders/[orderId]/gift-card-review/route";

const params = { storeId: "store-1", orderId: "order-1" };
const call = (decision: unknown) =>
  POST(new Request("https://admin.example.com/x", { method: "POST", body: JSON.stringify({ decision }) }), { params });
const pending = { id: "order-1", type: "GIFT_CARD", giftCardReview: "PENDING", paidAt: new Date(), fullName: "Luisa Sánchez" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "owner-1" });
  mocks.verifyStoreOwner.mockResolvedValue(undefined);
  mocks.findFirst.mockResolvedValue(pending);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.issue.mockResolvedValue({ card: { codeLast4: "AB12" }, code: "PDP-X", deliverTo: "x@y.co" });
  mocks.deliver.mockResolvedValue(true);
});

describe("POST /orders/[orderId]/gift-card-review", () => {
  it("solo la dueña decide", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await call("approve")).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "otra" });
    mocks.verifyStoreOwner.mockRejectedValue(Object.assign(new Error("No autorizado"), { statusCode: 403 }));
    expect((await call("approve")).status).not.toBe(200);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("«Aprobar y enviar» emite la tarjeta y manda el correo después de confirmar", async () => {
    const response = await call("approve");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ decision: "approve", delivered: true, codeLast4: "AB12" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", storeId: "store-1", giftCardReview: "PENDING" },
      data: { giftCardReview: "APPROVED" },
    });
    expect(mocks.issue).toHaveBeenCalledWith(expect.anything(), { storeId: "store-1", orderId: "order-1", createdBy: "owner-1" });
    expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({ code: "PDP-X" }), { buyerName: "Luisa Sánchez" });
  });

  it("«Rechazar» no emite nada", async () => {
    const response = await call("reject");
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { giftCardReview: "REJECTED" } }));
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("una tarjeta que ya no está en revisión (doble clic, otra pestaña) responde 409 sin emitir otra", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await call("approve")).status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValue({ ...pending, giftCardReview: "APPROVED" });
    expect((await call("approve")).status).toBe(409);
  });

  it("sin pago confirmado no se aprueba, y una decisión desconocida es 400", async () => {
    mocks.findFirst.mockResolvedValue({ ...pending, paidAt: null });
    expect((await call("approve")).status).toBe(409);
    mocks.findFirst.mockResolvedValue(pending);
    expect((await call("borrar")).status).toBe(400);
  });

  it("un pedido de otra tienda o que no es de tarjeta es 404", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await call("approve")).status).toBe(404);
    mocks.findFirst.mockResolvedValue({ ...pending, type: "STANDARD" });
    expect((await call("approve")).status).toBe(404);
  });
});
