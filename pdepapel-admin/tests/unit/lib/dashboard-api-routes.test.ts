import { describe, expect, it } from "vitest";

import { Models } from "@/constants";
import { getDashboardApiRoute } from "@/lib/dashboard-api-routes";

describe("getDashboardApiRoute", () => {
  const storeId = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

  it("keeps the orders REST endpoint independent from the Spanish dashboard path", () => {
    expect(getDashboardApiRoute(storeId, Models.Orders)).toBe(
      `/${storeId}/orders`,
    );
  });

  it("uses the products API for stock report tables", () => {
    expect(getDashboardApiRoute(storeId, Models.LowStock)).toBe(
      `/${storeId}/products`,
    );
    expect(getDashboardApiRoute(storeId, Models.OutOfStock)).toBe(
      `/${storeId}/products`,
    );
  });

  it("preserves the canonical API resource for regular tables", () => {
    expect(getDashboardApiRoute(storeId, Models.Products)).toBe(
      `/${storeId}/products`,
    );
    expect(getDashboardApiRoute(storeId, Models.Coupons)).toBe(
      `/${storeId}/coupons`,
    );
    expect(getDashboardApiRoute(storeId, Models.Shipments)).toBe(
      `/${storeId}/shipments`,
    );
  });
});
