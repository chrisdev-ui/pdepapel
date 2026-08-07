import { normalizeOrder } from "@/lib/normalization";
import { describe, expect, it } from "vitest";

describe("normalizeOrder", () => {
  it("normalizes catalog order items and shipping details", () => {
    const order = normalizeOrder({
      fullName: "Ana Gómez",
      phone: "3001234567",
      orderItems: [
        {
          id: "item-1",
          quantity: 2,
          unitPrice: 12000,
          product: {
            id: "product-1",
            name: "Agenda floral",
            price: 14000,
            images: [{ url: "https://example.com/agenda.webp", isMain: true }],
            color: { name: "Rosa" },
            size: { name: "M" },
          },
        },
      ],
      shipping: { id: "shipping-1", cost: "9500", status: "Preparing" },
    });

    expect(order.customerName).toBe("Ana Gómez");
    expect(order.customerPhone).toBe("3001234567");
    expect(order.shippingCost).toBe(9500);
    expect(order.items[0]).toMatchObject({
      productId: "product-1",
      unitPrice: 12000,
      imageUrl: "https://example.com/agenda.webp",
      isExternal: false,
      color: "Rosa",
      size: "M",
    });
  });

  it("preserves manual items without treating them as catalog products", () => {
    const order = normalizeOrder({
      items: [
        {
          id: "manual-item-1",
          name: "Empaque especial",
          description: "Caja de regalo",
          quantity: 1,
          price: "5000",
          imageUrl: "https://example.com/caja.webp",
        },
      ],
    });

    expect(order.items[0]).toMatchObject({
      name: "Empaque especial",
      unitPrice: 5000,
      imageUrl: "https://example.com/caja.webp",
      isExternal: true,
    });
  });

  it("keeps flattened order items with a product id as catalog products", () => {
    const order = normalizeOrder({
      orderItems: [
        {
          id: "item-2",
          productId: "product-2",
          name: "Agenda floral",
          quantity: 1,
          price: 18000,
          imageUrl: "https://example.com/agenda-floral.webp",
        },
      ],
    });

    expect(order.items[0]).toMatchObject({
      productId: "product-2",
      name: "Agenda floral",
      unitPrice: 18000,
      isExternal: false,
    });
  });
});
