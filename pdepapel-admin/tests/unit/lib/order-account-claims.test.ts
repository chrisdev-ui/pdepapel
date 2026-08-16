import { describe, expect, it } from "vitest";

import {
  createOrderAccountClaimToken,
  hasMatchingOrderAccountEmail,
  hashOrderAccountClaimToken,
} from "@/lib/order-account-claims";

describe("order account claims", () => {
  it("creates a random token while retaining only its one-way hash", () => {
    const claim = createOrderAccountClaimToken();

    expect(claim.token).toHaveLength(43);
    expect(claim.tokenHash).toHaveLength(64);
    expect(claim.tokenHash).toBe(hashOrderAccountClaimToken(claim.token));
    expect(claim.tokenHash).not.toContain(claim.token);
    expect(claim.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("matches emails safely after normalizing only casing and whitespace", () => {
    expect(
      hasMatchingOrderAccountEmail(" Compras@Ejemplo.com ", "compras@ejemplo.com"),
    ).toBe(true);
    expect(
      hasMatchingOrderAccountEmail("compras@ejemplo.com", "otra@ejemplo.com"),
    ).toBe(false);
    expect(hasMatchingOrderAccountEmail(null, "compras@ejemplo.com")).toBe(
      false,
    );
  });
});
