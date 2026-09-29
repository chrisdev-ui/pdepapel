import { GiftCardStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashGiftCardCode } from "@/lib/gift-card-codes";

/**
 * La validación pública: solo saldo y terminación, nunca el código; con
 * límite por IP y por código.
 */
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: { giftCard: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  getClientKey: () => "1.2.3.4",
}));

import { POST } from "@/app/api/[storeId]/gift-cards/validate/route";

const request = (code: unknown) =>
  new Request("https://admin.example.com/api/store-1/gift-cards/validate", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" },
    body: JSON.stringify({ code }),
  });

const card = {
  id: "card-1",
  codeHash: hashGiftCardCode("ABCDEFGHJKMN"),
  codeLast4: "JKMN",
  balance: 60000,
  status: GiftCardStatus.ACTIVE,
  expiresAt: null,
};

describe("POST /api/[storeId]/gift-cards/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
    mocks.findFirst.mockResolvedValue(card);
  });

  it("answers balance and last four for a usable card, looking it up by hash inside the store", async () => {
    const response = await POST(request("pdp-abcd-efgh-jkmn"), { params: { storeId: "store-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ balance: 60000, last4: "JKMN", expiresAt: null });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { storeId: "store-1", codeHash: card.codeHash } });
    const body = JSON.stringify(await (await POST(request("pdp-abcd-efgh-jkmn"), { params: { storeId: "store-1" } })).json());
    expect(body).not.toContain("ABCDEFGHJKMN");
    expect(body).not.toContain("codeHash");
  });

  it("rejects malformed codes without touching the database", async () => {
    const response = await POST(request("hola"), { params: { storeId: "store-1" } });
    expect(response.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown code and 409 for a voided, expired or empty card", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect((await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } })).status).toBe(404);
    mocks.findFirst.mockResolvedValueOnce({ ...card, status: GiftCardStatus.VOID });
    expect((await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } })).status).toBe(409);
    mocks.findFirst.mockResolvedValueOnce({ ...card, expiresAt: new Date(Date.now() - 1000) });
    expect((await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } })).status).toBe(409);
    mocks.findFirst.mockResolvedValueOnce({ ...card, balance: 0 });
    expect((await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } })).status).toBe(409);
  });

  it("throttles by IP before parsing and by code after", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 120 });
    const byIp = await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } });
    expect(byIp.status).toBe(429);
    expect(byIp.headers.get("Retry-After")).toBe("120");
    expect(mocks.findFirst).not.toHaveBeenCalled();

    mocks.consumeRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const byCode = await POST(request("PDP-ABCD-EFGH-JKMN"), { params: { storeId: "store-1" } });
    expect(byCode.status).toBe(429);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    const keys = mocks.consumeRateLimit.mock.calls.map((call) => call[0].key);
    expect(keys[0]).toBe("gift-card-validate:store-1:1.2.3.4");
    expect(keys[2]).toMatch(/^gift-card-validate-code:store-1:[0-9a-f]{16}$/);
  });
});
