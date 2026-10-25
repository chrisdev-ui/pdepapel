import { describe, expect, it } from "vitest";

import {
  createNewsletterToken,
  hashNewsletterToken,
  newsletterEmailKey,
  newsletterEmailLookupKeys,
  normalizeNewsletterEmail,
  normalizeNewsletterSource,
} from "@/lib/newsletter-tokens";

describe("newsletter token helpers", () => {
  it("normalizes email addresses without changing the stored display value", () => {
    expect(normalizeNewsletterEmail("  Cliente@Ejemplo.COM ")).toBe(
      "cliente@ejemplo.com",
    );
  });

  it("Gmail: la llave nueva quita puntos y lo que va después de +, y googlemail es gmail", () => {
    expect(newsletterEmailKey(" J.O.H.N@Gmail.com ")).toBe("john@gmail.com");
    expect(newsletterEmailKey("john+promo@gmail.com")).toBe("john@gmail.com");
    expect(newsletterEmailKey("j.ohn+x.y@googlemail.com")).toBe("john@gmail.com");
  });

  it("los demás dominios no cambian: puntos y + se quedan", () => {
    expect(newsletterEmailKey("Ana.Maria+tienda@Outlook.com")).toBe("ana.maria+tienda@outlook.com");
    expect(newsletterEmailKey("sin-arroba")).toBe("sin-arroba");
  });

  it("se busca con la forma nueva y con la vieja, sin repetir", () => {
    expect(newsletterEmailLookupKeys("J.ohn@gmail.com")).toEqual(["john@gmail.com", "j.ohn@gmail.com"]);
    expect(newsletterEmailLookupKeys("cliente@ejemplo.com")).toEqual(["cliente@ejemplo.com"]);
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
