import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    paymentWebhookEvent: {
      create: mocks.create,
      update: mocks.update,
      count: mocks.count,
      findFirst: mocks.findFirst,
    },
  },
}));

import {
  classifyPaymentWebhookOutcome,
  completePaymentWebhookEvent,
  completePaymentWebhookEventWithError,
  countRecentPaymentWebhookIssues,
  recordPaymentWebhookReceived,
} from "@/lib/payment-webhook-events";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://admin.test/api/webhook/bold", {
    method: "POST",
    headers,
  });

describe("recordPaymentWebhookReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores the raw body, the Bold signature and the parsed payload", async () => {
    mocks.create.mockResolvedValue({ id: "evt-1" });
    const rawBody = JSON.stringify({ type: "SALE_APPROVED" });

    const id = await recordPaymentWebhookReceived({
      provider: "BOLD",
      request: request({ "x-bold-signature": "abc" }),
      rawBody,
      storeId: "store-1",
    });

    expect(id).toBe("evt-1");
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        provider: "BOLD",
        storeId: "store-1",
        rawBody,
        signature: "abc",
        payload: { type: "SALE_APPROVED" },
      },
      select: { id: true },
    });
  });

  it("keeps an unparseable body and leaves the payload empty", async () => {
    mocks.create.mockResolvedValue({ id: "evt-2" });

    await recordPaymentWebhookReceived({
      provider: "WOMPI",
      request: request(),
      rawBody: "not json",
    });

    const data = mocks.create.mock.calls[0][0].data;
    expect(data.rawBody).toBe("not json");
    expect(data.payload).toBeUndefined();
    expect(data.signature).toBeNull();
    expect(data.storeId).toBeNull();
  });

  it("never throws when the database is down", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));

    await expect(
      recordPaymentWebhookReceived({
        provider: "BOLD",
        request: request(),
        rawBody: "{}",
      }),
    ).resolves.toBeNull();
  });
});

describe("classifyPaymentWebhookOutcome", () => {
  it.each([
    [500, null, "FAILED"],
    [503, { error: "x" }, "FAILED"],
    [400, { error: "Firma inválida" }, "REJECTED"],
    [404, { error: "Orden no encontrada" }, "REJECTED"],
    [200, { message: "Evento acknowledged" }, "IGNORED"],
    [200, { message: "La orden ya fue procesada anteriormente" }, "IGNORED"],
    [200, { message: "Pago procesado" }, "PROCESSED"],
    [200, null, "PROCESSED"],
  ])("%s with %j → %s", (status, body, expected) => {
    expect(classifyPaymentWebhookOutcome(status, body as never)).toBe(expected);
  });
});

describe("completePaymentWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does nothing without an event id", async () => {
    await completePaymentWebhookEvent(null, Response.json({ ok: true }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("closes a rejected event with the handler error and the resolved context", async () => {
    mocks.update.mockResolvedValue({});
    const response = Response.json(
      { error: "Monto no coincide" },
      { status: 400 },
    );

    await completePaymentWebhookEvent("evt-1", response, {
      orderId: "order-1",
      orderReference: "ref-1",
      transactionId: "tx-1",
      eventType: "SALE_APPROVED",
      storeId: "store-1",
    });

    expect(await response.json()).toEqual({ error: "Monto no coincide" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: expect.objectContaining({
        status: "REJECTED",
        statusCode: 400,
        error: "Monto no coincide",
        orderId: "order-1",
        orderReference: "ref-1",
        transactionId: "tx-1",
        eventType: "SALE_APPROVED",
        storeId: "store-1",
        completedAt: expect.any(Date),
      }),
    });
  });

  it("closes a processed event without an error and leaves unknown fields untouched", async () => {
    mocks.update.mockResolvedValue({});

    await completePaymentWebhookEvent(
      "evt-1",
      Response.json({ message: "Pago procesado" }),
      {},
    );

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.status).toBe("PROCESSED");
    expect(data.error).toBeNull();
    expect(data.orderId).toBeUndefined();
    expect(data.storeId).toBeUndefined();
  });

  it("swallows a failing update", async () => {
    mocks.update.mockRejectedValue(new Error("db down"));
    await expect(
      completePaymentWebhookEvent("evt-1", Response.json({ ok: true })),
    ).resolves.toBeUndefined();
  });
});

describe("completePaymentWebhookEventWithError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the event as failed with the thrown message", async () => {
    mocks.update.mockResolvedValue({});

    await completePaymentWebhookEventWithError("evt-1", new Error("boom"), {
      orderId: "o1",
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: expect.objectContaining({
        status: "FAILED",
        statusCode: 500,
        error: "boom",
        orderId: "o1",
      }),
    });
  });
});

describe("countRecentPaymentWebhookIssues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts rejected and failed events of the store or without store in the last 7 days", async () => {
    const now = new Date("2026-09-17T12:00:00.000Z");
    const latest = {
      provider: "BOLD",
      error: "Firma inválida",
      createdAt: now,
    };
    mocks.count.mockResolvedValue(3);
    mocks.findFirst.mockResolvedValue(latest);

    const result = await countRecentPaymentWebhookIssues("store-1", now);

    expect(result).toEqual({ count: 3, latest });
    const where = mocks.count.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ storeId: "store-1" }, { storeId: null }]);
    expect(where.status).toEqual({ in: ["REJECTED", "FAILED"] });
    expect(where.createdAt.gte).toEqual(new Date("2026-09-10T12:00:00.000Z"));
  });

  it("returns zero when the query fails", async () => {
    mocks.count.mockRejectedValue(new Error("db down"));
    mocks.findFirst.mockRejectedValue(new Error("db down"));

    await expect(countRecentPaymentWebhookIssues("store-1")).resolves.toEqual({
      count: 0,
      latest: null,
    });
  });
});
