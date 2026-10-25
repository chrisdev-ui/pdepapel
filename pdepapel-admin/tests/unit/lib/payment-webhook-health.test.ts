import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prismadb", () => ({ default: { paymentWebhookEvent: { count } } }));

import { measurePaymentWebhookHealth } from "@/lib/job-runs";
import { NOT_RECONCILIATION_WHERE, UNAUTHENTICATED_REJECTION_WHERE } from "@/lib/payment-webhook-events";

const now = new Date("2026-10-26T12:00:00.000Z");

/** Orden de las cuentas: aplicados, 5xx, rechazos auténticos, firmas con pedido, sondeos. */
const counts = (values: number[]) => values.forEach((value) => count.mockResolvedValueOnce(value));

describe("Webhooks de pago (24 h)", () => {
  beforeEach(() => count.mockReset());

  it("los sondeos solo se cuentan: la fila sigue verde", async () => {
    counts([12, 0, 0, 0, 5]);
    const row = await measurePaymentWebhookHealth("s1", now);
    expect(row).toMatchObject({ name: "payment-webhooks", metric: true, ok: true, attention: false });
    expect(row.detail).toBe("12 aplicados · 0 rechazos auténticos · 0 fallos (5xx) · 5 firmas inválidas sin pedido (sondeos)");
    const where = count.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ storeId: "s1" }, { storeId: null }]);
    expect(where.createdAt.gte).toEqual(new Date("2026-10-25T12:00:00.000Z"));
    expect(where.AND[0]).toBe(NOT_RECONCILIATION_WHERE);
    expect(count.mock.calls[4][0].where.AND).toEqual([NOT_RECONCILIATION_WHERE, { status: "REJECTED", orderId: null }, UNAUTHENTICATED_REJECTION_WHERE]);
  });

  it.each([
    [[3, 1, 0, 0, 0], "1 fallo (5xx)"],
    [[3, 0, 2, 0, 0], "2 rechazos auténticos"],
    [[3, 0, 0, 1, 0], "1 firma inválida con pedido"],
  ])("en rojo con %j", async (values, text) => {
    counts(values);
    const row = await measurePaymentWebhookHealth("s1", now);
    expect(row).toMatchObject({ ok: false, attention: true });
    expect(row.detail).toContain(text);
  });
});
