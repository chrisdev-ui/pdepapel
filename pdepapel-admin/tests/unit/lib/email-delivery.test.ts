import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.record }));

import { deliverEmails, isRetryableEmailFailure, sendWithRetry } from "@/lib/email-delivery";

/**
 * Incidente del 2026-10-07: un correo de pedido se perdió por un fallo de red
 * hacia Resend y nadie lo reintentó. Además, un `{ error }` de la API de Resend
 * (SDK 2.x no lanza) pasaba como si se hubiera enviado.
 */
const noWait = { wait: vi.fn().mockResolvedValue(undefined) };
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

beforeEach(() => {
  vi.clearAllMocks();
  noWait.wait.mockResolvedValue(undefined);
});

describe("isRetryableEmailFailure", () => {
  it("retries network errors, 429 and 5xx but not 4xx validation errors", () => {
    expect(isRetryableEmailFailure(networkError())).toBe(true);
    expect(isRetryableEmailFailure({ name: "rate_limit_exceeded", message: "slow down" })).toBe(true);
    expect(isRetryableEmailFailure({ name: "internal_server_error", message: "boom" })).toBe(true);
    expect(isRetryableEmailFailure({ name: "application_error", message: "boom" })).toBe(true);
    expect(isRetryableEmailFailure({ name: "validation_error", message: "bad to" })).toBe(false);
    expect(isRetryableEmailFailure({ name: "invalid_from_address", message: "nope" })).toBe(false);
    expect(isRetryableEmailFailure({ name: "missing_required_field", message: "nope" })).toBe(false);
  });
});

describe("sendWithRetry", () => {
  it("returns ok on the first success without waiting", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "em_1" }, error: null });
    await expect(sendWithRetry(send, noWait)).resolves.toEqual({ ok: true, attempts: 1, id: "em_1" });
    expect(noWait.wait).not.toHaveBeenCalled();
  });

  it("treats a Resend { error } as a failure, not a success", async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid `to`" } });
    const outcome = await sendWithRetry(send, noWait);
    expect(outcome).toMatchObject({ ok: false, attempts: 1, retryable: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure with ~1 s and ~3 s backoff and succeeds", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", message: "429" } })
      .mockResolvedValueOnce({ data: { id: "em_3" }, error: null });
    await expect(sendWithRetry(send, noWait)).resolves.toEqual({ ok: true, attempts: 3, id: "em_3" });
    expect(noWait.wait.mock.calls.map((call) => call[0])).toEqual([1_000, 3_000]);
  });

  it("gives up after three attempts and reports the last error", async () => {
    const send = vi.fn().mockRejectedValue(networkError());
    const outcome = await sendWithRetry(send, noWait);
    expect(outcome).toMatchObject({ ok: false, attempts: 3, retryable: true });
    expect(outcome.ok ? "" : outcome.error).toMatch(/fetch failed.*ECONNRESET/);
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("deliverEmails", () => {
  it("still sends the customer email when the admin one fails, and records only the admin failure by role", async () => {
    const admin = vi.fn().mockRejectedValue(networkError());
    const customer = vi.fn().mockResolvedValue({ data: { id: "em_c" }, error: null });

    const outcomes = await deliverEmails(
      [
        { role: "admin", send: admin },
        { role: "customer", send: customer },
      ],
      { storeId: "store-1", orderId: "order-1", kind: "order:PENDING", ...noWait },
    );

    expect(customer).toHaveBeenCalledTimes(1);
    expect(outcomes.customer).toMatchObject({ ok: true });
    expect(outcomes.admin).toMatchObject({ ok: false, attempts: 3 });
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "EMAIL", kind: "order:PENDING", recipient: "admin", orderId: "order-1" }),
    );
    // Nunca la dirección: solo el rol.
    expect(JSON.stringify(mocks.record.mock.calls)).not.toMatch(/@/);
  });

  it("records one row per failed recipient", async () => {
    const failing = vi.fn().mockResolvedValue({ data: null, error: { name: "validation_error", message: "x" } });
    await deliverEmails(
      [
        { role: "admin", send: failing },
        { role: "customer", send: failing },
      ],
      { orderId: "order-2", kind: "shipping:Delivered", ...noWait },
    );
    expect(mocks.record.mock.calls.map((call) => call[0].recipient).sort()).toEqual(["admin", "customer"]);
  });

  it("does not record when the caller counts attempts itself", async () => {
    await deliverEmails([{ role: "admin", send: vi.fn().mockRejectedValue(networkError()) }], {
      orderId: "order-3",
      kind: "order:PAID",
      recordFailures: false,
      ...noWait,
    });
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
