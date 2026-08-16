import { describe, expect, it } from "vitest";

import {
  getOrderAccountClaimRedirectPath,
  getOrderAccountClaimStorageKey,
} from "@/lib/order-account-claim";

describe("order account claim helpers", () => {
  it("keeps the one-time token scoped to its order in session storage", () => {
    expect(getOrderAccountClaimStorageKey("order-id")).toBe(
      "pdepapel:order-account-claim:order-id",
    );
  });

  it("returns customers to the same Spanish canonical order route", () => {
    expect(getOrderAccountClaimRedirectPath("order-id")).toBe(
      "/pedido/order-id",
    );
  });
});
