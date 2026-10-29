import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/env.mjs", () => ({ env: { GA4_MEASUREMENT_ID: "G-TEST", GA4_API_SECRET: "secreto-de-prueba" } }));
vi.mock("@/lib/prismadb", () => ({ default: { order: db } }));

import { recordDepositInGoogleAnalytics } from "@/lib/google-analytics";

const order = (payments: { amount: number }[]) => ({
  id: "order-1",
  orderNumber: "ORD-1",
  status: "DEPOSIT_PAID",
  depositAmount: 30000,
  analyticsClientId: "123.456",
  analyticsSessionId: "789",
  analyticsDepositTrackedAt: null,
  payments,
  orderItems: [{ name: "Calendario", price: 160000, brandName: null, product: { category: { name: "Calendarios" }, sku: "CAL" }, productId: "p1", quantity: 1, sku: "CAL" }],
});

let sent: Record<string, any>[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }));
  db.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** GA4 «preorder_deposit_paid»: el valor es lo que de verdad entró en el primer pago, no el anticipo esperado. */
describe("GA4 del anticipo de una preventa", () => {
  it("con $60.000 de primer pago manda 60.000, con referencia -A", async () => {
    db.findUnique.mockResolvedValue(order([{ amount: 60000 }]));
    expect(await recordDepositInGoogleAnalytics("order-1")).toBe("sent");
    expect(sent[0].events[0].name).toBe("preorder_deposit_paid");
    expect(sent[0].events[0].params).toMatchObject({ transaction_id: "ORD-1-A", value: 60000 });
  });

  it("sin cobro aprobado todavía usa el anticipo acordado", async () => {
    db.findUnique.mockResolvedValue(order([]));
    await recordDepositInGoogleAnalytics("order-1");
    expect(sent[0].events[0].params.value).toBe(30000);
  });
});
