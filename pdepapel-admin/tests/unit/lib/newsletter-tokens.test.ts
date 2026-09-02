import { describe, expect, it } from "vitest";

import {
  createNewsletterToken,
  hashNewsletterToken,
  normalizeNewsletterEmail,
  normalizeNewsletterSource,
} from "@/lib/newsletter-tokens";

describe("newsletter token helpers", () => {
  it("normalizes email addresses without changing the stored display value", () => {
    expect(normalizeNewsletterEmail("  Cliente@Ejemplo.COM ")).toBe(
      "cliente@ejemplo.com",
    );
  });

  it("creates opaque tokens and stable SHA-256 hashes", () => {
    const first = createNewsletterToken();
    const second = createNewsletterToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toHaveLength(64);
    expect(hashNewsletterToken(first.token)).toBe(first.tokenHash);
  });

  it("accepts only internal source paths", () => {
    expect(normalizeNewsletterSource("/producto/cuaderno")).toBe(
      "/producto/cuaderno",
    );
    expect(normalizeNewsletterSource("https://example.com")).toBe("/");
    expect(normalizeNewsletterSource()).toBe("/");
  });
});
