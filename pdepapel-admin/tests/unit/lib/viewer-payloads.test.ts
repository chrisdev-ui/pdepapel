import { describe, expect, it } from "vitest";

import {
  scrubFairEvent,
  scrubMarketplaceRow,
  scrubMargin,
  scrubOrder,
  scrubProduct,
  scrubProductGroup,
  scrubReview,
} from "@/lib/viewer-payloads";

/**
 * Lo que una cuenta de solo lectura no puede ver: el dinero de la casa y los
 * datos personales de las clientas. Cada prueba mira los campos concretos, no
 * solo que la función devuelva algo.
 */
describe("recorte para cuentas de solo lectura", () => {
  it("quita del producto el costo, el transporte y el proveedor, y conserva lo demás", () => {
    const product = {
      id: "p-1",
      name: "Libreta",
      sku: "LIB-1",
      price: 12000,
      stock: 4,
      acqPrice: 5000,
      transportationCost: 400,
      supplierId: "sup-1",
      supplier: { id: "sup-1", nit: "900" },
      abcClassification: "A",
      soldCount: 9,
    };
    const clean = scrubProduct(product) as Record<string, unknown>;
    for (const hidden of ["acqPrice", "transportationCost", "supplierId", "supplier", "abcClassification", "soldCount"]) {
      expect(clean, hidden).not.toHaveProperty(hidden);
    }
    expect(clean).toMatchObject({ id: "p-1", name: "Libreta", sku: "LIB-1", price: 12000, stock: 4 });
    // El original no se toca.
    expect(product.acqPrice).toBe(5000);
  });

  it("quita del pedido el contacto y la utilidad, conserva ciudad y departamento, y limpia las líneas", () => {
    const order = {
      id: "o-1",
      orderNumber: "ORD-1",
      status: "PAID",
      total: 50000,
      subtotal: 45000,
      createdAt: new Date("2026-09-01"),
      fullName: "Ana Pérez",
      email: "ana@ejemplo.com",
      phone: "3001234567",
      address: "Calle 1",
      address2: "Apto 2",
      addressReference: "Portería",
      neighborhood: "Centro",
      city: "Bogotá",
      department: "Cundinamarca",
      daneCode: "11001",
      documentId: "CC 123",
      company: "Empresa",
      totalProductCost: 20000,
      netProfit: 25000,
      gatewayFee: 1500,
      profitMarginPct: 55,
      adminNotes: "nota interna",
      orderItems: [{ id: "i-1", quantity: 2, price: 12000, product: { id: "p-1", name: "Libreta", acqPrice: 5000 } }],
    };
    const clean = scrubOrder(order) as Record<string, any>;
    for (const hidden of [
      "fullName", "email", "phone", "address", "address2", "addressReference", "neighborhood",
      "daneCode", "documentId", "company",
      "totalProductCost", "netProfit", "gatewayFee", "profitMarginPct", "adminNotes",
    ]) {
      expect(clean, hidden).not.toHaveProperty(hidden);
    }
    expect(clean).toMatchObject({ orderNumber: "ORD-1", status: "PAID", total: 50000, subtotal: 45000 });
    // De dónde vino la venta sí se ve: sirve para marketing y no identifica a nadie.
    expect(clean).toMatchObject({ city: "Bogotá", department: "Cundinamarca" });
    expect(clean.orderItems[0]).toMatchObject({ quantity: 2, price: 12000 });
    expect(clean.orderItems[0].product).not.toHaveProperty("acqPrice");
    expect(clean.orderItems[0].product).toMatchObject({ name: "Libreta" });
  });

  it("limpia las variantes de un grupo", () => {
    const group = { id: "g-1", name: "Agenda", products: [{ id: "p-1", name: "Blanca", acqPrice: 1 }] };
    const clean = scrubProductGroup(group) as Record<string, any>;
    expect(clean.products[0]).not.toHaveProperty("acqPrice");
    expect(clean.products[0]).toMatchObject({ name: "Blanca" });
  });

  it("quita el nombre de quien compró y la guía en las filas de marketplace", () => {
    const row = { id: "s-1", status: "shipped", trackingNumber: "TRK-1", marketplaceOrder: { id: "m-1", externalOrderId: "ML-9", buyerName: "Ana" } };
    const clean = scrubMarketplaceRow(row) as Record<string, any>;
    expect(clean).not.toHaveProperty("trackingNumber");
    expect(clean.marketplaceOrder).not.toHaveProperty("buyerName");
    expect(clean.marketplaceOrder).toMatchObject({ externalOrderId: "ML-9" });
  });

  it("quita el margen mínimo y el costo del producto asociado", () => {
    const listing = { id: "l-1", title: "Publicación", minimumMarginAmount: 3000, product: { id: "p", acqPrice: 1000, name: "X" } };
    const clean = scrubMargin(listing) as Record<string, any>;
    expect(clean).not.toHaveProperty("minimumMarginAmount");
    expect(clean.product).not.toHaveProperty("acqPrice");
  });

  it("quita el costo de los productos reservados de una feria y el contacto de sus ventas", () => {
    const detail = {
      id: "f-1",
      name: "Feria",
      inventoryItems: [{ id: "i", allocatedQuantity: 3, product: { id: "p", name: "X", acqPrice: 900 } }],
      orders: [{ id: "o", total: 1000, fullName: "Ana", phone: "300" }],
    };
    const clean = scrubFairEvent(detail) as Record<string, any>;
    expect(clean.inventoryItems[0].product).not.toHaveProperty("acqPrice");
    expect(clean.inventoryItems[0]).toMatchObject({ allocatedQuantity: 3 });
    expect(clean.orders[0]).not.toHaveProperty("fullName");
    expect(clean.orders[0]).toMatchObject({ total: 1000 });
  });

  it("conserva el nombre de quien reseña y quita la moderación", () => {
    const review = { id: "r-1", name: "Ana", rating: 5, comment: "Linda", userId: "user_1", moderationNote: "ok", moderatedBy: "owner" };
    const clean = scrubReview(review) as Record<string, unknown>;
    // El nombre ya se ve en la tienda: se conserva a propósito.
    expect(clean).toMatchObject({ name: "Ana", rating: 5, comment: "Linda" });
    for (const hidden of ["userId", "moderationNote", "moderatedBy"]) {
      expect(clean, hidden).not.toHaveProperty(hidden);
    }
  });

  it("no rompe con null ni undefined", () => {
    expect(scrubProduct(null)).toBeNull();
    expect(scrubOrder(undefined)).toBeUndefined();
    expect(scrubMarketplaceRow(null)).toBeNull();
  });
});
