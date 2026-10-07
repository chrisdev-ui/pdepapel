import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Incidente del 2026-10-07 (ORD-1791380325794-318): el correo al admin falló
 * por red y, como iban en el mismo `try`, el de la clienta ni se intentó. Y un
 * `{ error }` de Resend pasaba por enviado. Ahora cada destinatario va por su
 * lado, con reintentos, y cada fallo deja su fila con el rol.
 */
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  recordFailedNotification: vi.fn(),
  claimUpsert: vi.fn(),
  findOrder: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.recordFailedNotification }));
vi.mock("@/lib/prismadb", () => ({ default: { orderAccountClaim: { upsert: mocks.claimUpsert }, order: { findUnique: mocks.findOrder } } }));
vi.mock("@/lib/utils", () => ({
  currencyFormatter: (value: number) => `$ ${value}`,
  getReadablePaymentMethod: () => "Transferencia",
  getReadableStatus: (status: string) => `estado ${status}`,
}));

import { ADMIN_EMAIL_RECIPIENTS } from "@/lib/email-delivery";
import { sendOrderEmail, sendShippingEmail } from "@/lib/email";

// Como sale de la base (lib/email.ts, loadOrderForEmail): el pago es una relación.
const dbOrder = {
  id: "order-1",
  storeId: "store-1",
  orderNumber: "ORD-1",
  fullName: "Sol Prueba",
  email: "sol@example.com",
  phone: "+573000000018",
  address: "Calle 1",
  city: "Bogotá",
  subtotal: 15000,
  discount: 0,
  couponDiscount: 0,
  total: 15000,
  userId: null,
  type: "STANDARD",
  orderItems: [{ name: "Notas", quantity: 1, price: 15000 }],
  shipping: null,
  payment: { method: PaymentMethod.BankTransfer },
};
const order = dbOrder.id;

const isAdminCall = (call: unknown[]) => JSON.stringify((call[0] as { to: string[] }).to) === JSON.stringify(ADMIN_EMAIL_RECIPIENTS);
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

/** Corre una promesa que espera reintentos de 1 s y 3 s sin esperar de verdad. */
async function withFakeDelays<T>(run: () => Promise<T>): Promise<T> {
  const promise = run();
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  mocks.claimUpsert.mockResolvedValue({ token: "t" });
  mocks.findOrder.mockResolvedValue(dbOrder);
});
afterEach(() => vi.useRealTimers());

describe("sendOrderEmail delivery", () => {
  it("still emails the customer when the admin email fails for good, and records only the admin failure", async () => {
    mocks.send.mockImplementation(async (payload: { to: string[] }) =>
      isAdminCall([payload]) ? Promise.reject(networkError()) : { data: { id: "em_c" }, error: null },
    );

    const outcomes = await withFakeDelays(() => sendOrderEmail(order, OrderStatus.PENDING));

    const adminCalls = mocks.send.mock.calls.filter(isAdminCall);
    const customerCalls = mocks.send.mock.calls.filter((call) => !isAdminCall(call));
    expect(adminCalls).toHaveLength(3); // intento + 2 reintentos
    expect(customerCalls).toHaveLength(1);
    expect(outcomes).toMatchObject({ admin: { ok: false }, customer: { ok: true } });
    expect(mocks.recordFailedNotification).toHaveBeenCalledTimes(1);
    expect(mocks.recordFailedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "EMAIL", kind: "order:PENDING", recipient: "admin", orderId: "order-1" }),
    );
  });

  it("counts a Resend { error } as not sent and does not retry a validation error", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid `to` field" } });

    const outcomes = await withFakeDelays(() => sendOrderEmail(order, OrderStatus.PENDING));

    expect(mocks.send).toHaveBeenCalledTimes(2); // uno por destinatario, sin reintentos
    expect(outcomes).toMatchObject({ admin: { ok: false, retryable: false }, customer: { ok: false, retryable: false } });
    expect(mocks.recordFailedNotification.mock.calls.map((call) => call[0].recipient).sort()).toEqual(["admin", "customer"]);
  });

  it("recovers on retry without recording anything", async () => {
    let adminTries = 0;
    mocks.send.mockImplementation(async (payload: { to: string[] }) => {
      if (isAdminCall([payload]) && adminTries++ === 0) throw networkError();
      return { data: { id: "em" }, error: null };
    });

    const outcomes = await withFakeDelays(() => sendOrderEmail(order, OrderStatus.PENDING));

    expect(outcomes).toMatchObject({ admin: { ok: true, attempts: 2 }, customer: { ok: true, attempts: 1 } });
    expect(mocks.recordFailedNotification).not.toHaveBeenCalled();
  });

  it("sends only the requested role for the retry sweep and leaves recording to it", async () => {
    mocks.send.mockRejectedValue(networkError());

    const outcomes = await withFakeDelays(() =>
      sendOrderEmail(order, OrderStatus.PENDING, { roles: ["customer"], recordFailures: false }),
    );

    expect(mocks.send.mock.calls.every((call) => !isAdminCall(call))).toBe(true);
    expect(outcomes).toMatchObject({ customer: { ok: false } });
    expect(outcomes).not.toHaveProperty("admin");
    expect(mocks.recordFailedNotification).not.toHaveBeenCalled();
  });
});

describe("sendShippingEmail delivery", () => {
  it("records a lost shipping email per recipient instead of only logging it", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: "invalid_from_address", message: "nope" } });

    await withFakeDelays(() => sendShippingEmail(order, ShippingStatus.Delivered));

    expect(mocks.recordFailedNotification.mock.calls.map((call) => [call[0].kind, call[0].recipient]).sort()).toEqual([
      ["shipping:Delivered", "admin"],
      ["shipping:Delivered", "customer"],
    ]);
  });
});
