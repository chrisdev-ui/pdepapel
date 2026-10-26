import { readFileSync } from "node:fs";
import path from "node:path";
import { OrderSource, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  eventCreate: vi.fn(),
  eventFindFirst: vi.fn(),
  eventCount: vi.fn(),
  settlePaidPayment: vi.fn(),
  settleCancelledPayment: vi.fn(),
  settleDeclinedPayment: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findMany: mocks.findMany },
    paymentWebhookEvent: { create: mocks.eventCreate, findFirst: mocks.eventFindFirst, count: mocks.eventCount },
  },
}));
vi.mock("@/lib/payment-settlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment-settlement")>()),
  settlePaidPayment: mocks.settlePaidPayment,
  settleCancelledPayment: mocks.settleCancelledPayment,
  settleDeclinedPayment: mocks.settleDeclinedPayment,
}));
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));

import { KEY_PROBE_REFERENCE } from "@/lib/payment-gateway-lookup";
import { declineRetryWindowFromEnv, runPaymentReconciliation, selectReconciliationCandidates } from "@/lib/payment-reconciliation";

const now = new Date("2026-10-26T12:00:00.000Z");
/** Los rechazos de las fixtures son de las 10:05: a las 12:10 ya pasó la ventana de 2 h. */
const afterWindow = new Date("2026-10-26T12:10:00.000Z");
const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../../fixtures/gateways", name), "utf8");

function order(method: PaymentMethod, extra: Record<string, unknown> = {}) {
  const id = (extra.id as string) ?? "order-1";
  return {
    id,
    orderNumber: id === "order-1" ? "ORD-1" : `ORD-${id}`,
    storeId: "store-1",
    status: OrderStatus.PENDING,
    type: OrderType.STANDARD,
    source: OrderSource.STORE,
    total: 80000,
    giftCardAmount: null,
    createdAt: new Date("2026-10-26T09:50:00.000Z"),
    payment: { method, details: null },
    orderItems: [],
    coupon: null,
    shipping: null,
    ...extra,
  };
}

type Route = { status: number; body: string | null };
/** Respuestas por pasarela; cada llamada consume la siguiente de su lista o repite la última. */
function gateways(routes: { wompi?: Route[]; bold?: Route[] }) {
  const queues = { wompi: [...(routes.wompi ?? [])], bold: [...(routes.bold ?? [])] };
  const fetch = vi.fn(async (url: string) => {
    const key = url.includes("wompi") ? "wompi" : "bold";
    const queue = queues[key];
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (!next) throw new Error(`sin respuesta preparada para ${url}`);
    return new Response(next.body, { status: next.status });
  });
  const calls = (key: "wompi" | "bold") => fetch.mock.calls.filter(([url]) => (key === "wompi" ? url.includes("wompi") : url.includes("bold"))).map(([url]) => url as string);
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}
const ok = (name: string): Route => ({ status: 200, body: fixture(name) });

const redisKeys = new Set<string>();
const send = vi.fn();
const deps = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) => ({
  now,
  fetch,
  wompi: { baseUrl: "https://production.wompi.co/v1", privateKey: "prv_x" },
  bold: { identityKey: "identity" },
  alerts: {
    enabled: true,
    now,
    send,
    recipients: async () => ["avisos@prueba.test"],
    redis: {
      set: async (key: string) => {
        if (redisKeys.has(key)) return null;
        redisKeys.add(key);
        return "OK";
      },
    },
  },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  redisKeys.clear();
  send.mockResolvedValue({ data: { id: "e" }, error: null });
  mocks.eventCreate.mockResolvedValue({});
  mocks.eventFindFirst.mockResolvedValue(null);
  mocks.settlePaidPayment.mockResolvedValue({ outcome: "applied", revived: false, stockShortfall: 0 });
  mocks.settleCancelledPayment.mockResolvedValue({ outcome: "applied", restocked: false });
  mocks.settleDeclinedPayment.mockResolvedValue({ outcome: "applied", emailed: true });
  mocks.findMany.mockResolvedValue([]);
});

describe("candidatos", () => {
  it("pedidos sin cobrar de Bold (24 h) y Wompi (72 h) con más de 15 min, los más nuevos primero, sin punto de venta, feria ni datáfono", async () => {
    mocks.findMany.mockResolvedValue([
      order(PaymentMethod.Wompi, { id: "web" }),
      order(PaymentMethod.Bold, { id: "pos", source: OrderSource.POS }),
      order(PaymentMethod.Bold, { id: "fair", source: OrderSource.FAIR }),
      order(PaymentMethod.Bold, { id: "terminal", payment: { method: PaymentMethod.Bold, details: "x | cobro en datáfono Bold" } }),
      order(PaymentMethod.Bold, { id: "panel", source: null }),
    ]);
    const rows = await selectReconciliationCandidates(now);
    expect(rows.map((row) => row.id)).toEqual(["web", "panel"]);
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
      type: { not: OrderType.POINT_OF_SALE },
      createdAt: { lte: new Date("2026-10-26T11:45:00.000Z") },
      OR: [
        { payment: { method: PaymentMethod.Wompi }, createdAt: { gte: new Date("2026-10-23T12:00:00.000Z") } },
        { payment: { method: PaymentMethod.Bold }, createdAt: { gte: new Date("2026-10-25T12:00:00.000Z") } },
      ],
    });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.take).toBe(80);
  });
});

describe("decisión por respuesta de Wompi", () => {
  it("APPROVED con monto correcto: el camino compartido de pago, una fila PROCESSED y el aviso de que el webhook no llegó", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-approved.json")], bold: [{ status: 404, body: fixture("bold-404.json") }] });
    const summary = await runPaymentReconciliation(deps(fetch));

    expect(mocks.settlePaidPayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "Wompi", transactionId: "12345-1700000000-11111", source: "reconciliation", detailsText: "customer_email: clienta@example.com | payment_method_type: CARD" }),
    );
    const row = mocks.eventCreate.mock.calls[0][0].data;
    expect(row).toMatchObject({ provider: "WOMPI", eventType: "reconcile:APPROVED", status: "PROCESSED", statusCode: 200, orderId: "order-1", orderReference: "order-1", signature: null });
    expect(JSON.parse(row.rawBody)).toMatchObject({ id: "12345-1700000000-11111", status: "APPROVED" });
    expect(row.rawBody).not.toContain("prv_x");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toBe("⚠️ Un pago de Wompi llegó por la conciliación");
    expect(summary).toMatchObject({ ok: true, paid: 1, checked: 1 });
  });

  it("si el webhook ya lo aplicó, no escribe fila ni avisa", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    mocks.settlePaidPayment.mockResolvedValue({ outcome: "already", revived: false, stockShortfall: 0 });
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-approved.json")], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(summary.alreadyApplied).toBe(1);
    expect(summary.detail).toContain("ya aplicados 1");
  });

  it("un rechazo y luego una aprobación de la misma referencia: gana la aprobación", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-declined-then-approved.json")], bold: [{ status: 404, body: null }] });
    await runPaymentReconciliation(deps(fetch));
    expect(mocks.settlePaidPayment).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "12345-1700000000-11111" }));
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
  });

  it.each(["declined", "voided"])("%s pasada la ventana de 2 h: el camino compartido de anulación", async (name) => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok(`wompi-transactions-${name}.json`)], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch, { now: afterWindow }));
    expect(mocks.settleCancelledPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Wompi", gatewayStatus: name.toUpperCase(), source: "reconciliation" }));
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ eventType: `reconcile:${name.toUpperCase()}`, status: "PROCESSED" });
    expect(summary.cancelled).toBe(1);
  });

  it("un rechazo dentro de la ventana no cancela: queda pendiente con el correo de reintento (una fila la primera vez)", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-declined.json")], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(mocks.settleDeclinedPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Wompi", source: "reconciliation" }));
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ eventType: "reconcile:DECLINED", status: "PROCESSED" });
    expect(summary).toMatchObject({ ok: true, awaitingRetry: 1, cancelled: 0 });
    expect(summary.detail).toContain("rechazados esperando reintento 1");

    // La hora siguiente el correo ya salió: ni fila nueva ni cancelación.
    mocks.settleDeclinedPayment.mockResolvedValue({ outcome: "already", emailed: false });
    await runPaymentReconciliation(deps(fetch));
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
  });

  it("una anulación dentro de la ventana espera; la ventana se puede acortar para el sandbox", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-voided.json")], bold: [{ status: 404, body: null }] });
    await runPaymentReconciliation(deps(fetch));
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(mocks.settleDeclinedPayment).not.toHaveBeenCalled();

    await runPaymentReconciliation(deps(fetch, { declineRetryWindowMs: 30 * 60 * 1000 }));
    expect(mocks.settleCancelledPayment).toHaveBeenCalledTimes(1);
  });

  it("la ventana del sandbox solo acorta: 1 a 120 min, nada más largo que 2 h", () => {
    expect(declineRetryWindowFromEnv(undefined)).toBeUndefined();
    expect(declineRetryWindowFromEnv("abc")).toBeUndefined();
    expect(declineRetryWindowFromEnv("3")).toBe(3 * 60 * 1000);
    expect(declineRetryWindowFromEnv("0")).toBe(60 * 1000);
    expect(declineRetryWindowFromEnv("900")).toBe(2 * 60 * 60 * 1000);
  });

  it("ERROR es un rechazo: dentro de la ventana, correo de reintento; pasada, la anulación de siempre", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-error.json")], bold: [{ status: 404, body: null }] });
    expect(await runPaymentReconciliation(deps(fetch))).toMatchObject({ awaitingRetry: 1, cancelled: 0 });
    expect(mocks.settleDeclinedPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Wompi" }));

    const later = await runPaymentReconciliation(deps(fetch, { now: afterWindow }));
    expect(later).toMatchObject({ cancelled: 1 });
    expect(mocks.settleCancelledPayment).toHaveBeenCalledWith(expect.objectContaining({ gatewayStatus: "ERROR" }));
  });

  it.each(["pending", "empty"])("%s: no cambia nada ni escribe fila", async (name) => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    const { fetch } = gateways({ wompi: [ok(`wompi-transactions-${name}.json`)], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.settlePaidPayment).not.toHaveBeenCalled();
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ ok: true, unchanged: 1 });
  });

  it("APPROVED con otro monto: fila REJECTED y aviso, una sola vez por pedido", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi, { total: 90000 })]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-approved.json")], bold: [{ status: 404, body: null }] });
    await runPaymentReconciliation(deps(fetch));
    expect(mocks.settlePaidPayment).not.toHaveBeenCalled();
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ eventType: "reconcile:APPROVED", status: "REJECTED", statusCode: 400 });
    expect(send.mock.calls[0][0].subject).toBe("⚠️ Pago de Wompi con monto distinto");

    mocks.eventFindFirst.mockResolvedValue({ id: "seen" });
    await runPaymentReconciliation(deps(fetch));
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
  });

  it("si aplicar lanza, queda una fila FAILED y la corrida en rojo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Wompi)]);
    mocks.settlePaidPayment.mockRejectedValue(new Error("deadlock"));
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-approved.json")], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ status: "FAILED", statusCode: 500, error: "deadlock" });
    expect(summary.ok).toBe(false);
  });
});

describe("decisión por respuesta de Bold", () => {
  it("APPROVED con el total del pedido: pago por la referencia de Bold (número de pedido)", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Bold)]);
    const { fetch, calls } = gateways({ bold: [ok("bold-voucher-approved.json")], wompi: [ok("wompi-transactions-empty.json")] });
    await runPaymentReconciliation(deps(fetch));
    expect(calls("bold")).toEqual(["https://payments.api.bold.co/v2/payment-voucher/ORD-1"]);
    expect(mocks.settlePaidPayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "Bold", transactionId: "TX_BOLD_1", detailsText: "Bold Transaction ID: TX_BOLD_1 | Reference: ORD-1 | Status: PAID" }),
    );
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ provider: "BOLD", orderReference: "ORD-1", eventType: "reconcile:APPROVED" });
  });

  it("REJECTED o VOIDED pasada la ventana: anulación", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Bold), order(PaymentMethod.Bold, { id: "order-2" })]);
    const { fetch } = gateways({ bold: [ok("bold-voucher-rejected.json"), ok("bold-voucher-voided.json")], wompi: [ok("wompi-transactions-empty.json")] });
    const summary = await runPaymentReconciliation(deps(fetch, { now: afterWindow }));
    expect(mocks.settleCancelledPayment.mock.calls.map(([input]) => input.gatewayStatus)).toEqual(["REJECTED", "VOIDED"]);
    expect(summary.cancelled).toBe(2);
  });

  it("REJECTED dentro de la ventana: pendiente con correo de reintento; VOIDED espera", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Bold), order(PaymentMethod.Bold, { id: "order-2" })]);
    const { fetch } = gateways({ bold: [ok("bold-voucher-rejected.json"), ok("bold-voucher-voided.json")], wompi: [ok("wompi-transactions-empty.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.settleDeclinedPayment).toHaveBeenCalledTimes(1);
    expect(mocks.settleDeclinedPayment.mock.calls[0][0]).toMatchObject({ provider: "Bold", detailsText: "Bold Transaction ID: TX_BOLD_1 | Reference: ORD-1 | Status: REJECTED" });
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ awaitingRetry: 1, unchanged: 1 });
  });

  it.each(["processing", "pending", "failed", "no-transaction-found"])("%s: sin cambio", async (name) => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Bold)]);
    const { fetch } = gateways({ bold: [ok(`bold-voucher-${name}.json`)], wompi: [ok("wompi-transactions-empty.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.settlePaidPayment).not.toHaveBeenCalled();
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(summary.unchanged).toBe(1);
  });
});

describe("llaves que se diagnostican solas", () => {
  it("Wompi 401 INVALID_ACCESS_TOKEN: corta Wompi en la corrida, fila en rojo, un solo correo por hora; Bold sigue", async () => {
    mocks.findMany.mockResolvedValue([
      order(PaymentMethod.Wompi, { id: "w1" }),
      order(PaymentMethod.Wompi, { id: "w2" }),
      order(PaymentMethod.Wompi, { id: "w3" }),
      order(PaymentMethod.Bold, { id: "order-1" }),
    ]);
    const { fetch, calls } = gateways({ wompi: [{ status: 401, body: fixture("wompi-401-invalid-access-token.json") }], bold: [ok("bold-voucher-approved.json")] });
    const first = await runPaymentReconciliation(deps(fetch));

    expect(calls("wompi")).toHaveLength(1);
    expect(mocks.settlePaidPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Bold" }));
    expect(first.ok).toBe(false);
    expect(first.detail.startsWith("Llave de Wompi rechazada (HTTP 401)")).toBe(true);
    expect(first.detail).not.toContain("prv_x");
    expect(first.gateways.Wompi).toMatchObject({ lookups: 1, skipped: 2, keyRejected: 401 });
    const keyEmails = () => send.mock.calls.filter(([email]) => email.subject === "⚠️ Llave de Wompi rechazada");
    expect(keyEmails()).toHaveLength(1);
    expect(keyEmails()[0][0].react).toBeTruthy();
    expect(keyEmails()[0][0].text).toContain("HTTP 401");

    const second = await runPaymentReconciliation(deps(gateways({ wompi: [{ status: 401, body: fixture("wompi-401-invalid-access-token.json") }], bold: [ok("bold-voucher-approved.json")] }).fetch));
    expect(second.ok).toBe(false);
    expect(keyEmails()).toHaveLength(1);
  });

  it("Bold con error de autenticación: lo mismo, y Wompi sigue", async () => {
    mocks.findMany.mockResolvedValue([order(PaymentMethod.Bold, { id: "b1" }), order(PaymentMethod.Bold, { id: "b2" }), order(PaymentMethod.Wompi)]);
    const { fetch, calls } = gateways({ bold: [{ status: 401, body: fixture("bold-401.json") }], wompi: [ok("wompi-transactions-approved.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(calls("bold")).toHaveLength(1);
    expect(mocks.settlePaidPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Wompi" }));
    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain("Llave de Bold rechazada (HTTP 401)");
    expect(send.mock.calls.filter(([email]) => email.subject === "⚠️ Llave de Bold rechazada")).toHaveLength(1);
  });

  it("sin pedidos pendientes: una consulta autenticada por pasarela y la fila en verde", async () => {
    const { fetch, calls } = gateways({ wompi: [ok("wompi-transactions-empty.json")], bold: [{ status: 404, body: fixture("bold-404.json") }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(calls("wompi")).toEqual([`https://production.wompi.co/v1/transactions?reference=${KEY_PROBE_REFERENCE}`]);
    expect(calls("bold")).toEqual([`https://payments.api.bold.co/v2/payment-voucher/${KEY_PROBE_REFERENCE}`]);
    expect(summary.ok).toBe(true);
    expect(summary.detail).toContain("llave de Wompi verificada (sin pedidos pendientes)");
    expect(summary.detail).toContain("llave de Bold verificada (sin pedidos pendientes)");
    expect(send).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("sin pedidos y la llave rechazada: rojo y un correo", async () => {
    const { fetch } = gateways({ wompi: [{ status: 401, body: fixture("wompi-401-invalid-access-token.json") }], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain("Llave de Wompi rechazada (HTTP 401)");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("una llave sin configurar se dice sin llamar a la pasarela", async () => {
    const { fetch, calls } = gateways({ wompi: [ok("wompi-transactions-empty.json")] });
    const summary = await runPaymentReconciliation(deps(fetch, { bold: { identityKey: "" } }));
    expect(calls("bold")).toHaveLength(0);
    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain("Llave de Bold sin configurar");
  });
});

describe("caídas, topes y tiempo", () => {
  it("tres consultas seguidas sin respuesta y esa pasarela se deja; la fila queda en rojo sin correo", async () => {
    mocks.findMany.mockResolvedValue(["a", "b", "c", "d", "e"].map((id) => order(PaymentMethod.Wompi, { id })));
    const { fetch, calls } = gateways({ wompi: [{ status: 503, body: null }], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(calls("wompi")).toHaveLength(3);
    expect(summary.gateways.Wompi.skipped).toBe(2);
    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain("Wompi sin respuesta (HTTP 503)");
    expect(send).not.toHaveBeenCalled();
  });

  it("pasado el presupuesto de la corrida se corta y se dice «parcial»", async () => {
    mocks.findMany.mockResolvedValue(["a", "b", "c"].map((id) => order(PaymentMethod.Wompi, { id })));
    let tick = 0;
    const clock = () => (tick++ === 0 ? 0 : 60_000);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-empty.json")], bold: [{ status: 404, body: null }] });
    const summary = await runPaymentReconciliation(deps(fetch, { clock }));
    expect(summary.partial).toBe(true);
    expect(summary.detail).toContain("parcial");
  });
});

describe("pagados que la pasarela anuló después", () => {
  const sandboxVoid = JSON.parse(fixture("wompi-transactions-voided-sandbox.json")).data[0];
  const paidWompi = (extra: Record<string, unknown> = {}) =>
    order(PaymentMethod.Wompi, {
      id: sandboxVoid.reference,
      status: OrderStatus.PAID,
      total: sandboxVoid.amount_in_cents / 100,
      paidAt: new Date("2026-10-26T08:00:00.000Z"),
      payment: { method: PaymentMethod.Wompi, details: null, transactionId: sandboxVoid.id },
      ...extra,
    });

  it("busca pagados en línea dentro de 72 h (Wompi) y 24 h (Bold) desde el pago, sin punto de venta, feria ni datáfono", async () => {
    const { selectPaidRecheckCandidates } = await import("@/lib/payment-reconciliation");
    mocks.findMany.mockResolvedValue([
      paidWompi(),
      order(PaymentMethod.Bold, { id: "pos", status: OrderStatus.PAID, source: OrderSource.POS }),
      order(PaymentMethod.Bold, { id: "pendiente" }),
    ]);
    const rows = await selectPaidRecheckCandidates(now);
    expect(rows.map((row) => row.id)).toEqual([sandboxVoid.reference]);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      status: OrderStatus.PAID,
      type: { not: OrderType.POINT_OF_SALE },
      OR: [
        { payment: { method: PaymentMethod.Wompi }, paidAt: { gte: new Date("2026-10-23T12:00:00.000Z") } },
        { payment: { method: PaymentMethod.Bold }, paidAt: { gte: new Date("2026-10-25T12:00:00.000Z") } },
      ],
    });
  });

  it("la anulación real del sandbox de Wompi (sin evento): cancela por el camino compartido, deja fila y avisa", async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidWompi()]);
    const { fetch, calls } = gateways({ wompi: [ok("wompi-transactions-voided-sandbox.json")], bold: [ok("bold-voucher-no-transaction-found.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(calls("wompi")[0]).toContain(`reference=${sandboxVoid.reference}`);
    expect(mocks.settleCancelledPayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "Wompi", transactionId: sandboxVoid.id, gatewayStatus: "VOIDED", source: "reconciliation" }),
    );
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ provider: "WOMPI", eventType: "reconcile:VOIDED", status: "PROCESSED" });
    expect(summary).toMatchObject({ rechecked: 1, voided: 1, cancelled: 0 });
    expect(summary.detail).toContain("anulados en la pasarela 1");
    expect(send.mock.calls.map(([email]) => email.subject)).toContain("⚠️ Un pago de Wompi se anuló en la pasarela");
  });

  it("si la transacción que pagó sigue APPROVED no toca nada, aunque haya otra anulada", async () => {
    const approvedFirst = JSON.parse(fixture("wompi-transactions-voided-sandbox.json"));
    approvedFirst.data = [{ ...approvedFirst.data[0], status: "APPROVED" }, { ...approvedFirst.data[0], id: "otra", status: "VOIDED" }];
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidWompi()]);
    const { fetch } = gateways({ wompi: [{ status: 200, body: JSON.stringify(approvedFirst) }], bold: [ok("bold-voucher-no-transaction-found.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(mocks.settleCancelledPayment).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ rechecked: 1, voided: 0 });
  });

  it.each([
    ["pickup", "para recoger"],
    ["shipped", "ya despachado"],
  ] as const)("anulado en la pasarela pero %s: no se toca, una fila IGNORED, un aviso por pedido y se ve en Sistemas", async (holdReason, words) => {
    mocks.settleCancelledPayment.mockResolvedValue({ outcome: "held", restocked: false, holdReason });
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidWompi()]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-voided-sandbox.json")], bold: [ok("bold-voucher-no-transaction-found.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(summary).toMatchObject({ ok: true, heldForReview: 1, voided: 0, alreadyApplied: 0 });
    expect(summary.detail).toContain("anulados por revisar 1");
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({ eventType: "reconcile:VOIDED", status: "IGNORED", statusCode: 200 });
    expect(mocks.eventCreate.mock.calls[0][0].data.error).toContain(words);
    const subjects = send.mock.calls.map(([email]) => email.subject);
    expect(subjects).toEqual([`⚠️ Pago anulado en la pasarela: revisar pedido #ORD-${sandboxVoid.reference}`]);
    expect(send.mock.calls[0][0].text).toContain("No se cambió nada");
    expect(Array.from(redisKeys)).toContain(`monitor:payment-webhook:WOMPI:void-held:${sandboxVoid.reference}`);

    // La hora siguiente sigue anulado: se cuenta otra vez en Sistemas, sin fila ni correo nuevos.
    mocks.eventFindFirst.mockResolvedValue({ id: "seen" });
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidWompi()]);
    const again = await runPaymentReconciliation(deps(fetch));
    expect(again.heldForReview).toBe(1);
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("dos pedidos por revisar en la misma hora: un aviso por cada uno", async () => {
    mocks.settleCancelledPayment.mockResolvedValue({ outcome: "held", restocked: false, holdReason: "pickup" });
    const second = JSON.parse(fixture("wompi-transactions-voided-sandbox.json"));
    second.data[0] = { ...second.data[0], id: "tx-otro", reference: "otro" };
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      paidWompi(),
      paidWompi({ id: "otro", orderNumber: "ORD-otro", payment: { method: PaymentMethod.Wompi, details: null, transactionId: "tx-otro" } }),
    ]);
    const { fetch } = gateways({ wompi: [ok("wompi-transactions-voided-sandbox.json"), { status: 200, body: JSON.stringify(second) }], bold: [ok("bold-voucher-no-transaction-found.json")] });
    const summary = await runPaymentReconciliation(deps(fetch));
    expect(summary.heldForReview).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("Bold VOIDED en un pedido pagado: cancela; si el webhook ya lo había anulado, ni fila ni aviso", async () => {
    const paidBold = order(PaymentMethod.Bold, { status: OrderStatus.PAID, paidAt: new Date("2026-10-26T08:00:00.000Z") });
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidBold]);
    const first = gateways({ bold: [ok("bold-voucher-voided.json")], wompi: [ok("wompi-transactions-empty.json")] });
    expect(await runPaymentReconciliation(deps(first.fetch))).toMatchObject({ voided: 1 });
    expect(mocks.settleCancelledPayment).toHaveBeenCalledWith(expect.objectContaining({ provider: "Bold", gatewayStatus: "VOIDED" }));

    vi.clearAllMocks();
    redisKeys.clear();
    mocks.settleCancelledPayment.mockResolvedValue({ outcome: "already", restocked: false });
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([paidBold]);
    const second = gateways({ bold: [ok("bold-voucher-voided.json")], wompi: [ok("wompi-transactions-empty.json")] });
    expect(await runPaymentReconciliation(deps(second.fetch))).toMatchObject({ voided: 0, alreadyApplied: 1 });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
