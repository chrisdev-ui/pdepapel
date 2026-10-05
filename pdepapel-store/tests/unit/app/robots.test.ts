import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("storefront robots policy", () => {
  it("lets Clarity replay public Next.js assets without exposing private routes", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const clarityRule = rules.find(
      (rule) => rule.userAgent === "Clarity-Bot",
    );

    expect(clarityRule).toEqual(
      expect.objectContaining({
        allow: expect.arrayContaining([
          "/",
          "/_next/static/",
          "/_next/image",
        ]),
        disallow: expect.arrayContaining([
          "/api/",
          "/pedido/",
          "/finalizar-compra/",
          "/mis-pedidos/",
        ]),
      }),
    );
    expect(clarityRule?.disallow).not.toContain("/_next/");
  });

  it("keeps Next.js internals and private customer routes out of search crawlers", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const publicRule = rules.find((rule) => rule.userAgent === "*");

    expect(publicRule?.disallow).toEqual(
      expect.arrayContaining([
        "/_next/",
        "/api/",
        "/carrito/",
        "/pedido/",
        "/crear-cuenta/",
      ]),
    );
  });

  /** AhrefsBot descargaba el catálogo entero de fotos (6 % del ancho de banda de Cloudinary). */
  it("blocks AhrefsBot entirely and leaves Googlebot-Image on the public rule", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];

    expect(rules.find((rule) => rule.userAgent === "AhrefsBot")).toEqual({ userAgent: "AhrefsBot", disallow: "/" });
    expect(rules.find((rule) => rule.userAgent === "Amazonbot")).toEqual({ userAgent: "Amazonbot", disallow: "/" });
    expect(rules.some((rule) => String(rule.userAgent).includes("Googlebot"))).toBe(false);
    expect(rules.find((rule) => rule.userAgent === "*")?.allow).toContain("/");
  });

  /**
   * Con `/_next/` entero bloqueado, Googlebot no podía bajar los JS ni las
   * imágenes de `/_next/image` (Search Console: 49 de 61 recursos sin cargar).
   * Solo se abren esas dos rutas; el bloqueo de `/_next/` se queda para el resto.
   */
  it("lets search crawlers fetch Next.js static assets and images, and nothing else under /_next/", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const publicRule = rules.find((rule) => rule.userAgent === "*");

    expect(publicRule?.allow).toEqual(["/", "/_next/static/", "/_next/image"]);
    expect(publicRule?.disallow).toContain("/_next/");
    expect(publicRule?.disallow).toEqual(
      expect.arrayContaining(["/tienda?", "/categoria/*?", "/shop?", "/api/", "/carrito/"]),
    );
  });
});
