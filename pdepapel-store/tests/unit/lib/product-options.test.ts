import { describe, expect, it } from "vitest";

import {
  getStructuredProductSize,
  isCustomerFacingLegacySize,
} from "@/lib/product-options";
import type { Product } from "@/types";

describe("customer-facing product options", () => {
  it.each(["S", "S+", "M-P", "L-L", "XL"])(
    "hides internal shipping size %s",
    (value) => {
      expect(
        isCustomerFacingLegacySize({ id: value, name: value, value }),
      ).toBe(false);
    },
  );

  it("keeps real commercial formats visible", () => {
    expect(
      isCustomerFacingLegacySize({ id: "a5", name: "A5", value: "A5" }),
    ).toBe(true);
  });

  it("prefers a migrated commercial option over the legacy field", () => {
    const product = {
      size: { id: "internal", name: "S", value: "S-P" },
      catalogOptionValues: [
        {
          option: {
            id: "format",
            key: "formato",
            name: "Formato",
            displayOrder: 0,
          },
          optionValue: { id: "a5", name: "A5", value: "a5" },
        },
      ],
    } as Product;

    expect(getStructuredProductSize(product)).toBe("A5");
  });
});
