import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OrderSource, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook y conciliación pasan por el mismo reclamo de `lib/payment-settlement.ts`:
 * el que llega segundo no descuenta, no escribe fila y no manda correo.
 */
const mocks = vi.hoisted(() => ({
  state: { status: "PENDING" as string },
  createInventoryMovementBatchResilient: vi.fn(),
  sendOrderEmail: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@/lib/env.mjs", () => ({ env: { WOMPI_EVENTS_KEY: "wompi-events-key" } }));
vi.mock("@/lib/bold", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bold")>()),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
}));

function currentOrder(method: PaymentMethod) {
  return {
    id: "order-1",
    orderNumber: "ORD-1",
    storeId: "store-1",
    userId: null,
    fullName: "Clienta",
    status: mocks.state.status,
    type: OrderType.STANDARD,
    source: OrderSource.STORE,
    riskReasons: null,
    total: 80000,
    giftCardAmount: null,
    createdAt: new Date("2026-10-26T09:50:00.000Z"),
    payment: { method, details: null },
    coupon: null,
    shipping: { cost: 5000, codFee: 0, envioClickIdOrder: null, envioClickIdRate: null },
    orderItems: [{ id: "item-1", productId: "product-1", quantity: 1, isPreorder: false, product: { acqPrice: 1, price: 80000 } }],
  };
}
const method = { current: PaymentMethod.Bold as PaymentMethod };

vi.mock("@/lib/prismadb", () => {
  const matches = (guard: any) => (!guard ? true : typeof guard === "string" ? guard === mocks.state.status : guard.in.includes(mocks.state.status));
  const tx = {
    order: {
      update: vi.fn(),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!matches(where.status)) return { count: 0 };
        mocks.state.status = data.status;
        return { count: 1 };
      }),
    },
    coupon: { update: vi.fn(), updateMany: vi.fn() },
    paymentDetails: { upsert: vi.fn() },
    shipping: { upsert: vi.fn() },
  };
  return {
    default: {
      order: {
        findFirst: vi.fn(async () => currentOrder(method.current)),
        findUnique: vi.fn(async () => currentOrder(method.current)),
        findMany: vi.fn(async () => (["CREATED", "PENDING"].includes(mocks.state.status) ? [currentOrder(method.current)] : [])),
      },
      paymentWebhookEvent: { create: mocks.eventCreate, update: vi.fn(), findFirst: vi.fn(async () => null) },
      orderPayment: { findMany: vi.fn(async () => []) },
      orderInventoryIssue: { count: async () => 0 },
      capsuleOrder: { findMany: async () => [] },
      $transaction: async (callback: any) => callback(tx),
    },
  };
});
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@/lib/capsule-payment", () => ({ applyCapsulePayment: vi.fn() }));
vi.mock("@/lib/capsule-cancel", () => ({ withoutDrawnCapsuleUnits: async (_db: unknown, movements: unknown[]) => movements }));
vi.mock("@/lib/gift-cards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gift-cards")>()),
  issueGiftCardForOrder: vi.fn(async () => null),
  redeemGiftCardForOrder: vi.fn(),
  handleGiftCardOnOrderCancellation: vi.fn(),
}));
vi.mock("@/lib/inventory", () => ({ createInventoryMovementBatchResilient: mocks.createInventoryMovementBatchResilient }));
vi.mock("@/lib/order-stock-movements", () => ({ explodeKitMovements: async (_tx: unknown, movements: unknown) => movements }));
vi.mock("@/lib/presale", () => ({ settlePresaleLinesOnPayment: async () => new Set(), releasePresaleLinesOnCancellation: async () => new Set() }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/financial", () => ({ calculateOrderFinancials: vi.fn(async () => ({})) }));
vi.mock("@/lib/google-analytics", () => ({ recordPaidOrderInGoogleAnalytics: vi.fn() }));

import { POST as boldPOST } from "@/app/api/webhook/bold/route";
import { POST as wompiPOST } from "@/app/api/webhook/wompi/route";
import { runPaymentReconciliation } from "@/lib/payment-reconciliation";

const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../../fixtures/gateways", name), "utf8");
const fetch = vi.fn(async (url: string) =>
  url.includes("wompi") ? new Response(fixture("wompi-transactions-approved.json"), { status: 200 }) : new Response(fixture("bold-voucher-approved.json"), { status: 200 }),
);
const reconcile = () =>
  runPaymentReconciliation({
    now: new Date("2026-10-26T12:00:00.000Z"),
    fetch: fetch as unknown as typeof globalThis.fetch,
    wompi: { baseUrl: "https://production.wompi.co/v1", privateKey: "prv_x" },
    bold: { identityKey: "identity" },
    alerts: { enabled: false },
  });

const boldWebhook = () =>
  boldPOST(
    new Request("https://admin.test/api/webhook/bold", {
      method: "POST",
      headers: { "x-bold-signature": "firma" },
      body: JSON.stringify({ type: "SALE_APPROVED", data: { amount: { currency: "COP", total: 80000 }, metadata: { reference: "ORD-1" }, payment_id: "TX_BOLD_1" } }),
    }),
  );

function wompiWebhook() {
  const transaction = JSON.parse(fixture("wompi-transactions-approved.json")).data[0];
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const timestamp = 1700000000;
  const checksum = crypto.createHash("sha256").update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}wompi-events-key`).digest("hex");
  return wompiPOST(
    new Request("https://admin.test/api/webhook/wompi", {
      method: "POST",
      body: JSON.stringify({ event: "transaction.updated", data: { transaction }, signature: { properties, checksum }, timestamp }),
    }),
  );
}

const reconciliationRows = () => mocks.eventCreate.mock.calls.filter(([call]) => String(call.data.eventType ?? "").startsWith("reconcile:"));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.status = OrderStatus.PENDING;
  mocks.eventCreate.mockResolvedValue({ id: "evt" });
  mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed: [] });
});

describe.each([
  ["Bold", PaymentMethod.Bold, boldWebhook],
  ["Wompi", PaymentMethod.Wompi, wompiWebhook],
] as const)("%s: se aplica una sola vez", (_name, paymentMethod, webhook) => {
  beforeEach(() => {
    method.current = paymentMethod;
  });

  it("webhook y luego conciliación", async () => {
    expect((await webhook()).status).toBe(200);
    const summary = await reconcile();
    expect(mocks.state.status).toBe(OrderStatus.PAID);
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(1);
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1);
    expect(reconciliationRows()).toHaveLength(0);
    expect(summary.paid).toBe(0);
  });

  it("conciliación y luego webhook", async () => {
    const summary = await reconcile();
    expect(summary.paid).toBe(1);
    const response = await webhook();
    await expect(response.json()).resolves.toEqual({ message: "Orden ORD-1 ya fue procesada anteriormente" });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(1);
    expect(mocks.createInventoryMovementBatchResilient.mock.calls[0][1][0].reason).toMatch(/\(conciliación\)$/);
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1);
    expect(reconciliationRows()).toHaveLength(1);
  });
});
