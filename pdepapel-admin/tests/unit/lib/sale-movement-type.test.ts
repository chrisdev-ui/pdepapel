import { OrderType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { saleMovementType } from "@/lib/sale-movement-type";

describe("saleMovementType", () => {
  it("el punto de venta es venta presencial; lo demás, venta", () => {
    expect(saleMovementType(OrderType.POINT_OF_SALE)).toBe("IN_PERSON_SALE");
    expect(saleMovementType(OrderType.STANDARD)).toBe("ORDER_PLACED");
    expect(saleMovementType(OrderType.CUSTOM)).toBe("ORDER_PLACED");
    expect(saleMovementType(undefined)).toBe("ORDER_PLACED");
  });
});
