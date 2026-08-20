import {
  accountAccessPath,
  getSafeStorefrontRedirectPath,
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

  it("keeps account redirects inside the storefront and out of auth loops", () => {
    expect(
      getSafeStorefrontRedirectPath("/carrito?source=account#resumen"),
    ).toBe("/carrito?source=account#resumen");
    expect(getSafeStorefrontRedirectPath("https://example.com")).toBe("/");
    expect(getSafeStorefrontRedirectPath("//example.com")).toBe("/");
    expect(getSafeStorefrontRedirectPath("/\\example.com")).toBe("/");
    expect(getSafeStorefrontRedirectPath("/crear-cuenta?step=1")).toBe("/");
    expect(getSafeStorefrontRedirectPath("/sign-in?step=1")).toBe("/");
  });

  it("builds safe Clerk account links with the canonical Spanish routes", () => {
    expect(accountAccessPath(STOREFRONT_ROUTES.signUp, "/carrito")).toBe(
      "/crear-cuenta?redirect_url=%2Fcarrito",
    );
    expect(
      accountAccessPath(STOREFRONT_ROUTES.signIn, "https://example.com"),
    ).toBe("/iniciar-sesion?redirect_url=%2F");
  });
});
