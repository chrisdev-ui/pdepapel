import { describe, expect, it } from "vitest";

import {
  scrubFairEvent,
  scrubProductGroup,
  VIEWER_HIDDEN_CAPSULE_FIELDS,
} from "@/lib/viewer-payloads";
import { INTERNAL_PRODUCT_FIELDS, SUPPLIER_PICKER_SELECT } from "@/lib/public-catalog";
import { getReconciliationRowState, summarizeReconciliation } from "@/lib/fair-phases";

/**
 * Lo que de verdad viaja al navegador de una cuenta de solo lectura.
 *
 * Estas dos fugas llegaron a producción porque nadie miró la **forma del
 * dato**, solo si había guardia. Aquí se afirma sobre el objeto ya depurado:
 * si un campo vuelve a colarse, falla, aunque la pantalla no lo pinte.
 */
describe("la feria depurada no lleva dinero de la casa", () => {
  const detail = {
    id: "fair-1",
    name: "Feria de Usaquén",
    inventoryItems: [
      {
        id: "item-1",
        allocatedQuantity: 10,
        soldQuantity: 4,
        product: {
          id: "p1",
          name: "Agenda Hadas",
          price: 37000,
          acqPrice: 15000,
          transportationCost: 500,
          supplierId: "sup-1",
          abcClassification: "A",
          soldCount: 120,
        },
      },
    ],
    capsules: [
      {
        id: "cap-1",
        code: "CAP-0031",
        salePrice: 25000,
        productCost: 9000,
        minimumMarginPct: 30,
        product: { id: "p1", name: "Agenda Hadas" },
      },
    ],
    orders: [
      {
        id: "o1",
        orderNumber: "FERIA-1",
        total: 49000,
        fullName: "Ana Pérez",
        phone: "3001234567",
        city: "Bogotá",
        netProfit: 20000,
      },
    ],
  };

  const clean = scrubFairEvent(detail) as typeof detail;
  const payload = JSON.stringify(clean);

  it("quita el costo de compra y lo interno del producto reservado", () => {
    for (const field of INTERNAL_PRODUCT_FIELDS) {
      expect(clean.inventoryItems[0].product, `product.${field}`).not.toHaveProperty(field);
    }
    expect(payload).not.toContain("acqPrice");
    expect(payload).not.toContain("transportationCost");
  });

  it("quita lo que costó armar la cápsula y su margen mínimo", () => {
    for (const field of VIEWER_HIDDEN_CAPSULE_FIELDS) {
      expect(clean.capsules[0], `capsule.${field}`).not.toHaveProperty(field);
    }
    // Esta era la mitad que el depurador no cubría: la ruta de API también
    // entregaba el costo de la cápsula a una cuenta de solo lectura.
    expect(payload).not.toContain("productCost");
    expect(payload).not.toContain("minimumMarginPct");
  });

  it("quita el contacto de la clienta y la utilidad del pedido", () => {
    expect(clean.orders[0]).not.toHaveProperty("fullName");
    expect(clean.orders[0]).not.toHaveProperty("phone");
    expect(clean.orders[0]).not.toHaveProperty("netProfit");
  });

  it("conserva lo que sí sirve: unidades, precio de venta y ciudad", () => {
    expect(clean.inventoryItems[0].allocatedQuantity).toBe(10);
    expect(clean.inventoryItems[0].soldQuantity).toBe(4);
    expect(clean.inventoryItems[0].product.price).toBe(37000);
    expect(clean.orders[0]).toHaveProperty("city", "Bogotá");
    expect(clean.capsules[0]).toHaveProperty("salePrice", 25000);
  });
});

describe("el grupo de productos depurado no lleva costos ni proveedor", () => {
  const group = {
    id: "g1",
    name: "Agendas 2027",
    products: [
      {
        id: "p1",
        name: "Agenda Hadas · Rosa",
        price: 37000,
        acqPrice: 15000,
        transportationCost: 500,
        supplierId: "sup-1",
        abcClassification: "A",
        soldCount: 120,
      },
    ],
  };

  const clean = scrubProductGroup(group) as typeof group;

  it("cada variante pierde los campos internos", () => {
    for (const field of INTERNAL_PRODUCT_FIELDS) {
      expect(clean.products[0], `product.${field}`).not.toHaveProperty(field);
    }
    expect(JSON.stringify(clean)).not.toContain("acqPrice");
    expect(JSON.stringify(clean)).not.toContain("supplierId");
  });

  it("la variante conserva su nombre y su precio público", () => {
    expect(clean.products[0].name).toBe("Agenda Hadas · Rosa");
    expect(clean.products[0].price).toBe(37000);
  });
});

describe("el selector de proveedores solo pide id y nombre", () => {
  it("la proyección compartida no incluye NIT, contacto ni notas", () => {
    expect(SUPPLIER_PICKER_SELECT).toEqual({ id: true, name: true });
    for (const field of ["nit", "contactName", "phone", "email", "notes", "leadTimeDays"]) {
      expect(SUPPLIER_PICKER_SELECT, field).not.toHaveProperty(field);
    }
  });
});

/**
 * La conciliación ya no llega con «devuelto = todo lo que no se vendió».
 * Estas pruebas fijan la propiedad que importa: un formulario sin tocar no
 * cuadra, así que el botón de cerrar no se enciende.
 */
describe("la conciliación no da por contado lo que no se contó", () => {
  const items = [
    { productId: "p1", allocatedQuantity: 10, soldQuantity: 4 },
    { productId: "p2", allocatedQuantity: 5, soldQuantity: 5 },
  ];
  const untouched = {
    p1: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
    p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
  };

  it("sin contar nada, la feria no cuadra y no se puede cerrar", () => {
    const summary = summarizeReconciliation(items, untouched);
    expect(summary.balanced).toBe(false);
    expect(summary.unbalanced).toBe(1);
  });

  it("una fila sin contar dice cuántas faltan, no «cuadra»", () => {
    const row = getReconciliationRowState(items[0], untouched.p1);
    expect(row.status).toBe("missing");
    expect(row.expected).toBe(6);
    expect(row.delta).toBe(6);
  });

  it("un producto vendido entero no pide cuenta", () => {
    expect(getReconciliationRowState(items[1], untouched.p2).status).toBe("sold-out");
  });

  it("repartir entre devuelto, dañado y perdido cuadra la feria", () => {
    const counted = {
      p1: { returnedQuantity: 4, damagedQuantity: 1, lostQuantity: 1 },
      p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
    };
    const summary = summarizeReconciliation(items, counted);
    expect(summary.balanced).toBe(true);
    // Lo dañado y lo perdido no vuelven al stock: se cuentan aparte.
    expect(summary.returned).toBe(4);
    expect(summary.damaged).toBe(1);
    expect(summary.lost).toBe(1);
  });

  it("el atajo «todo volvió intacto» cuadra sin inventar daños", () => {
    const asIfIntact = {
      p1: { returnedQuantity: 6, damagedQuantity: 0, lostQuantity: 0 },
      p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
    };
    const summary = summarizeReconciliation(items, asIfIntact);
    expect(summary.balanced).toBe(true);
    expect(summary.returned).toBe(6);
    expect(summary.damaged + summary.lost).toBe(0);
  });
});
