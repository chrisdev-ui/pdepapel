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
});
