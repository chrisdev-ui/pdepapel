import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));

import { OrderStatus } from "@prisma/client";

import { unappliedSettlementMessage, voidHoldReason } from "@/lib/payment-settlement";
import { classifyPaymentWebhookOutcome } from "@/lib/payment-webhook-events";

describe("respuesta del webhook cuando no aplica nada", () => {
  it("un pago tardío sobre un pedido presencial cancelado no dice «ya fue procesada»", () => {
    const message = unappliedSettlementMessage("POS-1", "late-on-cancelled");
    expect(message).not.toMatch(/ya fue procesada/);
    expect(message).toMatch(/cancelada y sin reactivar/);
    expect(classifyPaymentWebhookOutcome(200, { message })).toBe("IGNORED");
  });

  it("una anulación por revisar lo dice y queda IGNORED", () => {
    const message = unappliedSettlementMessage("ORD-2", "held");
    expect(message).toMatch(/la anulación quedó para revisión/);
    expect(classifyPaymentWebhookOutcome(200, { message })).toBe("IGNORED");
  });

  it("un pedido ya aplicado conserva el texto de siempre", () => {
    expect(unappliedSettlementMessage("ORD-1", "already")).toBe("Orden ORD-1 ya fue procesada anteriormente");
  });
});

describe("cuándo una anulación sobre un pagado queda para revisión", () => {
  const delivery = { provider: "ENVIOCLICK", status: "Preparing", envioClickIdOrder: null, guideUrl: null, trackingCode: null } as const;
  it.each([
    ["envío a domicilio que no ha salido", { status: OrderStatus.PAID, shipping: delivery }, null],
    ["envío manual que no ha salido", { status: OrderStatus.PAID, shipping: { ...delivery, provider: "MANUAL" } }, null],
    ["sin envío (pedido del panel para recoger)", { status: OrderStatus.PAID, shipping: null }, "pickup"],
    ["Recoge en tienda", { status: OrderStatus.PAID, shipping: { ...delivery, provider: "NONE" } }, "pickup"],
    ["con guía de EnvioClick", { status: OrderStatus.PAID, shipping: { ...delivery, envioClickIdOrder: 7 } }, "shipped"],
    ["con número de guía manual", { status: OrderStatus.PAID, shipping: { ...delivery, trackingCode: "G-1" } }, "shipped"],
    ["con el PDF de guía", { status: OrderStatus.PAID, shipping: { ...delivery, guideUrl: "https://x/guia.pdf" } }, "shipped"],
    ["recogido por la transportadora", { status: OrderStatus.PAID, shipping: { ...delivery, status: "PickedUp" } }, "shipped"],
    ["marcado enviado", { status: OrderStatus.SENT, shipping: delivery }, "shipped"],
  ])("%s", (_label, order, expected) => {
    expect(voidHoldReason(order as never)).toBe(expected);
  });
});
