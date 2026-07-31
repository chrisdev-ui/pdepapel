import {
  STOREFRONT_ROUTES,
  categoryPath,
  orderPath,
  productPath,
  quotePath,
} from "@/lib/routes";
import { describe, expect, it } from "vitest";

describe("customer-facing routes", () => {
  it("uses Spanish canonical routes for all navigable static pages", () => {
    expect(STOREFRONT_ROUTES).toMatchObject({
      about: "/nosotros",
      cart: "/carrito",
      checkout: "/finalizar-compra",
      contact: "/contacto",
      myOrders: "/mis-pedidos",
      shop: "/tienda",
      wishlist: "/favoritos",
    });
  });

  it("builds canonical product, category, order and quote paths", () => {
    expect(productPath("agenda-floral")).toBe("/producto/agenda-floral");
    expect(categoryPath("boligrafos-lapiceros")).toBe(
      "/categoria/boligrafos-lapiceros",
    );
    expect(orderPath("order-123")).toBe("/pedido/order-123");
    expect(quotePath("quote-token")).toBe("/cotizacion/quote-token");
  });
});
