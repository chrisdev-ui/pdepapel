import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api-errors";
import {
  describeOpenRestockOrders,
  describeSupplierHeadline,
  describeSupplierReferences,
  duplicateSupplierMessage,
  findDuplicateSupplierName,
  formatSupplierDate,
  normalizeSupplierPhone,
  parseSupplierInput,
  supplierDeleteBlockedMessage,
  supplierFormSchema,
  supplierToFormValues,
  toSupplierPayload,
  SUPPLIER_MESSAGES,
} from "@/lib/suppliers";

const fullPayload = {
  name: "  Henko Importaciones ",
  nit: " 900.123.456-7 ",
  contactName: "Laura Gómez",
  phone: "+57 (300) 123-45 67",
  email: " Ventas@Henko.COM ",
  leadTimeDays: "15",
  notes: "Paga a 30 días. ",
};

function expectInvalid(body: unknown, message: string) {
  try {
    parseSupplierInput(body);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toBe(message);
    return;
  }
  throw new Error("parseSupplierInput no rechazó el cuerpo");
}

describe("parseSupplierInput", () => {
  it("accepts a full payload and normalises every field", () => {
    expect(parseSupplierInput(fullPayload)).toEqual({
      name: "Henko Importaciones",
      nit: "900.123.456-7",
      contactName: "Laura Gómez",
      phone: "+573001234567",
      email: "ventas@henko.com",
      leadTimeDays: 15,
      notes: "Paga a 30 días.",
    });
  });

  it("turns empty optional fields into null so a PATCH can clear them", () => {
    expect(parseSupplierInput({ name: "Kawaii Co", nit: "", phone: " ", leadTimeDays: "" })).toEqual({
      name: "Kawaii Co",
      nit: null,
      contactName: null,
      phone: null,
      email: null,
      leadTimeDays: null,
      notes: null,
    });
  });

  it("requires a name of at least two characters, in Spanish", () => {
    expectInvalid({}, SUPPLIER_MESSAGES.nameRequired);
    expectInvalid({ name: "   " }, SUPPLIER_MESSAGES.nameRequired);
    expectInvalid({ name: "A" }, SUPPLIER_MESSAGES.nameMin);
    expectInvalid({ name: "x".repeat(81) }, SUPPLIER_MESSAGES.nameMax);
  });

  it("rejects a bad email, a bad phone and a bad lead time with Spanish messages", () => {
    expectInvalid({ name: "Kawaii Co", email: "ventas@" }, SUPPLIER_MESSAGES.emailInvalid);
    expectInvalid({ name: "Kawaii Co", phone: "300-ABC" }, SUPPLIER_MESSAGES.phoneInvalid);
    expectInvalid({ name: "Kawaii Co", phone: "12345" }, SUPPLIER_MESSAGES.phoneInvalid);
    expectInvalid({ name: "Kawaii Co", leadTimeDays: 400 }, SUPPLIER_MESSAGES.leadTimeInvalid);
    expectInvalid({ name: "Kawaii Co", leadTimeDays: 2.5 }, SUPPLIER_MESSAGES.leadTimeInvalid);
    expectInvalid({ name: "Kawaii Co", leadTimeDays: "-1" }, SUPPLIER_MESSAGES.leadTimeInvalid);
    expectInvalid({ name: "Kawaii Co", notes: "n".repeat(2001) }, SUPPLIER_MESSAGES.notesMax);
  });

  it("keeps only digits and an optional leading plus in the phone", () => {
    expect(normalizeSupplierPhone("(300) 123-45 67")).toBe("3001234567");
    expect(normalizeSupplierPhone(" +57 300.123.4567 ")).toBe("+573001234567");
    expect(normalizeSupplierPhone("")).toBe("");
    expect(normalizeSupplierPhone(undefined)).toBe("");
    // Las letras no se borran en silencio: la validación las rechaza.
    expect(normalizeSupplierPhone("300-ABC")).toBe("300ABC");
  });
});

describe("supplierFormSchema and toSupplierPayload", () => {
  it("round-trips a stored supplier through the form values", () => {
    const stored = {
      name: "Henko",
      nit: null,
      contactName: "Laura",
      phone: "+573001234567",
      email: "ventas@henko.com",
      leadTimeDays: 7,
      notes: null,
    };
    const values = supplierToFormValues(stored);
    expect(values).toEqual({
      name: "Henko",
      nit: "",
      contactName: "Laura",
      phone: "+573001234567",
      email: "ventas@henko.com",
      leadTimeDays: "7",
      notes: "",
    });
    expect(supplierFormSchema.safeParse(values).success).toBe(true);
    expect(toSupplierPayload(values)).toEqual(stored);
  });

  it("flags the same errors as the API, in Spanish", () => {
    const result = supplierFormSchema.safeParse({
      name: "H",
      nit: "",
      contactName: "",
      phone: "abc",
      email: "nope",
      leadTimeDays: "999",
      notes: "",
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toEqual([
      SUPPLIER_MESSAGES.nameMin,
      SUPPLIER_MESSAGES.phoneInvalid,
      SUPPLIER_MESSAGES.emailInvalid,
      SUPPLIER_MESSAGES.leadTimeInvalid,
    ]);
  });
});

describe("uniqueness and deletion copy", () => {
  it("finds a duplicate name ignoring case and surrounding spaces, but not itself", () => {
    const candidates = [
      { id: "s1", name: "Henko Importaciones" },
      { id: "s2", name: "Kawaii Co" },
    ];
    expect(findDuplicateSupplierName(candidates, "  henko importaciones ")?.id).toBe("s1");
    expect(findDuplicateSupplierName(candidates, "HENKO IMPORTACIONES", "s1")).toBeUndefined();
    expect(findDuplicateSupplierName(candidates, "Henko")).toBeUndefined();
    expect(duplicateSupplierMessage("Henko")).toBe("Ya existe un proveedor llamado «Henko» en esta tienda.");
  });

  it("names both counts when refusing a deletion", () => {
    expect(supplierDeleteBlockedMessage({ products: 38, restockOrders: 6 })).toBe(
      "No se puede eliminar: 38 productos y 6 pedidos de aprovisionamiento lo referencian. Reasigna los productos y conserva los pedidos como historial.",
    );
    expect(supplierDeleteBlockedMessage({ products: 1, restockOrders: 0 })).toBe(
      "No se puede eliminar: 1 producto lo referencia. Reasigna los productos.",
    );
    expect(supplierDeleteBlockedMessage({ products: 0, restockOrders: 2 })).toBe(
      "No se puede eliminar: 2 pedidos de aprovisionamiento lo referencian. Conserva los pedidos como historial.",
    );
    expect(describeSupplierReferences({ products: 0, restockOrders: 0 })).toBe("");
  });
});

describe("usage copy", () => {
  it("describes open orders and the headline with the last purchase", () => {
    expect(describeOpenRestockOrders({ orderedRestockOrders: 0, receivingRestockOrders: 1 })).toBe("1 recibiendo");
    expect(describeOpenRestockOrders({ orderedRestockOrders: 2, receivingRestockOrders: 1 })).toBe("2 pedidos en camino, 1 recibiendo");
    expect(describeOpenRestockOrders({ orderedRestockOrders: 0, receivingRestockOrders: 0 })).toBe("Ninguno");

    const now = new Date("2026-09-11T12:00:00Z");
    expect(formatSupplierDate(new Date("2026-08-05T15:00:00Z"), now)).toBe("5 de ago");
    expect(formatSupplierDate(new Date("2025-08-05T15:00:00Z"), now)).toBe("5 de ago de 2025");
    // Medianoche UTC sigue siendo el día anterior en Bogotá.
    expect(formatSupplierDate(new Date("2026-08-06T02:00:00Z"), now)).toBe("5 de ago");

    expect(
      describeSupplierHeadline(
        "Henko Importaciones",
        { products: 38, restockOrders: 6, orderedRestockOrders: 0, receivingRestockOrders: 1, lastPurchaseAt: new Date("2026-08-05T15:00:00Z") },
        now,
      ),
    ).toBe("Henko Importaciones · 38 productos · 6 pedidos de aprovisionamiento · última compra el 5 de ago");
    expect(
      describeSupplierHeadline(
        "Nuevo",
        { products: 0, restockOrders: 0, orderedRestockOrders: 0, receivingRestockOrders: 0, lastPurchaseAt: null },
        now,
      ),
    ).toBe("Nuevo · 0 productos · 0 pedidos de aprovisionamiento · sin compras todavía");
  });
});
