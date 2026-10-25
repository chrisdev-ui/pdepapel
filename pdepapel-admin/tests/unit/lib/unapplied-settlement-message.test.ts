import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));

import { unappliedSettlementMessage } from "@/lib/payment-settlement";
import { classifyPaymentWebhookOutcome } from "@/lib/payment-webhook-events";

describe("respuesta del webhook cuando no aplica nada", () => {
  it("un pago tardío sobre un pedido presencial cancelado no dice «ya fue procesada»", () => {
    const message = unappliedSettlementMessage("POS-1", "late-on-cancelled");
    expect(message).not.toMatch(/ya fue procesada/);
    expect(message).toMatch(/cancelada y sin reactivar/);
    expect(classifyPaymentWebhookOutcome(200, { message })).toBe("IGNORED");
  });

  it("un pedido ya aplicado conserva el texto de siempre", () => {
    expect(unappliedSettlementMessage("ORD-1", "already")).toBe("Orden ORD-1 ya fue procesada anteriormente");
  });
});
