import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NEWSLETTER_EARLY_ACCESS_SECRET: undefined } }));

import { createEarlyAccessToken, verifyEarlyAccessToken } from "@/lib/early-access";

const SECRET = "early-access-secret-for-tests";
const NOW = new Date("2026-10-01T12:00:00.000Z");
const payload = { storeId: "store-1", homeContentId: "content-1", exp: Math.floor(NOW.getTime() / 1000) + 3600 };

describe("early access tokens", () => {
  it("round-trips a signed payload", () => {
    const token = createEarlyAccessToken(payload, SECRET);
    expect(verifyEarlyAccessToken("store-1", token, NOW, SECRET)).toEqual(payload);
  });

  it("rejects other stores, tampering, expiry and a missing secret", () => {
    const token = createEarlyAccessToken(payload, SECRET);
    expect(verifyEarlyAccessToken("store-2", token, NOW, SECRET)).toBeNull();
    expect(verifyEarlyAccessToken("store-1", `${token}x`, NOW, SECRET)).toBeNull();
    expect(verifyEarlyAccessToken("store-1", token, new Date(NOW.getTime() + 2 * 3600 * 1000), SECRET)).toBeNull();
    expect(verifyEarlyAccessToken("store-1", token, NOW, undefined)).toBeNull();
    expect(verifyEarlyAccessToken("store-1", "not-a-token", NOW, SECRET)).toBeNull();
  });
});
