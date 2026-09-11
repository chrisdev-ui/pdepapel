import { describe, expect, it } from "vitest";

import { describeInPersonOrdersInBatch, getInPersonOrderGuard, isInPersonOrderType } from "@/lib/in-person-orders";
import { OrderType } from "@prisma/client";

describe("in-person order guards", () => {
  it("treats point-of-sale and fair sales as in-person, nothing else", () => {
    expect(isInPersonOrderType(OrderType.POINT_OF_SALE)).toBe(true);
    expect(isInPersonOrderType(OrderType.FESTIVAL)).toBe(true);
    expect(isInPersonOrderType(OrderType.STANDARD)).toBe(false);
    expect(isInPersonOrderType(OrderType.QUOTATION)).toBe(false);
    expect(isInPersonOrderType(OrderType.CUSTOM)).toBe(false);
    expect(isInPersonOrderType(null)).toBe(false);
    expect(isInPersonOrderType(undefined)).toBe(false);
  });

  it("points a fair sale at the fair and a counter sale at inventory adjustments", () => {
    expect(getInPersonOrderGuard(OrderType.FESTIVAL, "edit")).toContain("desde la feria");
    expect(getInPersonOrderGuard(OrderType.FESTIVAL, "delete")).toContain("inventario reservado");
    expect(getInPersonOrderGuard(OrderType.FESTIVAL, "convert")).toContain("Regístrala desde la feria");
    expect(getInPersonOrderGuard(OrderType.POINT_OF_SALE, "edit")).toContain("devolución o ajuste de inventario");
    expect(getInPersonOrderGuard(OrderType.POINT_OF_SALE, "delete")).toContain("no se eliminan");
    expect(getInPersonOrderGuard(OrderType.POINT_OF_SALE, "convert")).toContain("Punto de venta");
    expect(getInPersonOrderGuard(OrderType.STANDARD, "edit")).toBeNull();
    expect(getInPersonOrderGuard(OrderType.CUSTOM, "delete")).toBeNull();
  });

  it("describes a batch only when it carries in-person sales, listing at most five", () => {
    expect(describeInPersonOrdersInBatch([{ orderNumber: "A", type: OrderType.STANDARD }], "delete")).toBeNull();
    const one = describeInPersonOrdersInBatch([{ orderNumber: "A", type: OrderType.STANDARD }, { orderNumber: "F-1", type: OrderType.FESTIVAL }], "edit");
    expect(one).toContain("Un pedido es una venta presencial o de feria");
    expect(one).toContain("F-1 (venta de feria)");
    expect(one).toContain("no se editan");
    expect(one).toContain("No se cambió ninguno");
    const many = describeInPersonOrdersInBatch(
      Array.from({ length: 7 }, (_, i) => ({ orderNumber: `P-${i}`, type: OrderType.POINT_OF_SALE })),
      "delete",
    );
    expect(many).toContain("7 pedidos son ventas presenciales o de feria");
    expect(many).toContain("P-4 (venta presencial)");
    expect(many).not.toContain("P-5");
    expect(many).toContain("y 2 más");
    expect(many).toContain("no se eliminan");
  });
});
