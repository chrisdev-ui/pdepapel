import crypto from "crypto";
import { describe, expect, it } from "vitest";

import {
  InvalidWebhookPayloadError,
  parseProviderDate,
  readWebhookStoreId,
  readWebhookToken,
  safeHexEquals,
  safeSecretEquals,
} from "@/lib/webhook-auth";

const request = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers });

describe("webhook auth helpers", () => {
  it("never lets an empty or missing secret through", () => {
    expect(safeSecretEquals("abc", "abc")).toBe(true);
    expect(safeSecretEquals("abc", "abd")).toBe(false);
    expect(safeSecretEquals("abc", "")).toBe(false);
    expect(safeSecretEquals("", "")).toBe(false);
    expect(safeSecretEquals(null, "abc")).toBe(false);
    expect(safeSecretEquals("abc", undefined)).toBe(false);
    // Distinta longitud: no debe lanzar (timingSafeEqual sí lo haría).
    expect(safeSecretEquals("abcd", "abc")).toBe(false);
  });

  it("compares provider checksums without caring about case", () => {
    const hash = crypto.createHash("sha256").update("x").digest("hex");
    expect(safeHexEquals(hash.toUpperCase(), hash)).toBe(true);
    expect(safeHexEquals(`${hash.slice(0, -1)}0`, hash)).toBe(false);
    expect(safeHexEquals(undefined, hash)).toBe(false);
  });

  it("reads the token from the header or the configured URL", () => {
    expect(readWebhookToken(request("https://a.test/w?token=from-url"))).toBe("from-url");
    expect(
      readWebhookToken(request("https://a.test/w?token=from-url", { "x-webhook-token": " from-header " })),
    ).toBe("from-header");
    expect(readWebhookToken(request("https://a.test/w"))).toBeNull();
  });

  it("reads the optional store scope", () => {
    expect(readWebhookStoreId(request("https://a.test/w?store=s1"))).toBe("s1");
    expect(readWebhookStoreId(request("https://a.test/w"))).toBeNull();
  });

  it("turns an unreadable provider date into a 400 instead of a crash", () => {
    expect(parseProviderDate(undefined, "d")).toBeUndefined();
    expect(parseProviderDate("", "d")).toBeUndefined();
    expect(parseProviderDate("2026-09-10T10:00:00Z", "d")?.toISOString()).toBe(
      "2026-09-10T10:00:00.000Z",
    );
    expect(() => parseProviderDate("ayer por la tarde", "realPickupDate")).toThrow(
      InvalidWebhookPayloadError,
    );
  });
});
