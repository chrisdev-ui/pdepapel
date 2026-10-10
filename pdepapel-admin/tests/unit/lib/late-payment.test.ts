import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), findUnique: vi.fn(), deliver: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { order: { update: mocks.update, findUnique: mocks.findUnique } } }));
vi.mock("@/lib/email-delivery", () => ({ deliverEmails: mocks.deliver }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["panel@example.com"] }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));

import { blocksLatePaymentRevival, flagPaymentOnCancelledOrder } from "@/lib/late-payment";

const order = { id: "order-1", storeId: "store-1", orderNumber: "ORD-9", type: "GIFT_CARD", riskScore: 0, riskReasons: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(order);
  mocks.update.mockResolvedValue({});
  mocks.deliver.mockImplementation(async (jobs: { send: () => Promise<unknown> }[]) => {
    for (const job of jobs) await job.send();
    return { admin: { ok: true, attempts: 1 } };
  });
});

describe("pagos tardíos en pedidos cancelados", () => {
  it("una tarjeta de regalo o un pedido cancelado como fraude no revive con un pago tardío; un pedido normal sí, como antes", () => {
    expect(blocksLatePaymentRevival({ type: "GIFT_CARD", riskReasons: null })).toBe(true);
    expect(blocksLatePaymentRevival({ type: "STANDARD", riskReasons: "fraude-confirmado" })).toBe(true);
    expect(blocksLatePaymentRevival({ type: "STANDARD", riskReasons: "envio-rapido" })).toBe(false);
  });

  it("marca el pedido y avisa al panel con el enlace al pedido, una sola vez", async () => {
    await flagPaymentOnCancelledOrder("order-1", "Wompi");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { riskScore: 0, riskReasons: "pago-en-cancelado" },
    });
    const sent = mocks.send.mock.calls[0][0];
    expect(sent.to).toEqual(["panel@example.com"]);
    expect(sent.subject).toBe("⚠️ Pago recibido en pedido cancelado — #ORD-9");
    expect(sent.text).toContain("https://admin.papeleriapdepapel.com/store-1/pedidos/order-1");
    expect(sent.text).toContain("Wompi");
    expect(mocks.deliver.mock.calls[0][1]).toMatchObject({ storeId: "store-1", orderId: "order-1", kind: "order:late-payment" });

    mocks.findUnique.mockResolvedValue({ ...order, riskReasons: "pago-en-cancelado" });
    await flagPaymentOnCancelledOrder("order-1", "Wompi");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
