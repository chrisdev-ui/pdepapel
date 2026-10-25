import { describe, expect, it } from "vitest";

import { clampPublicPageSize, MAX_PUBLIC_PAGE_SIZE } from "@/lib/public-page-size";

describe("tope de página de GET /products", () => {
  it("recorta un tamaño gigante a 100 en vez de responder error", () => {
    expect(MAX_PUBLIC_PAGE_SIZE).toBe(100);
    expect(clampPublicPageSize("5000")).toBe(100);
    expect(clampPublicPageSize("101")).toBe(100);
  });

  it("deja pasar los tamaños que usan la tienda y el panel", () => {
    expect(clampPublicPageSize("24")).toBe(24);
    expect(clampPublicPageSize("60")).toBe(60);
    expect(clampPublicPageSize("100")).toBe(100);
  });

  it("un valor ausente, cero, negativo o inválido cuenta como «no viene»", () => {
    for (const raw of [null, "", "0", "-5", "abc", "Infinity"]) expect(clampPublicPageSize(raw), String(raw)).toBe(0);
    expect(clampPublicPageSize("12.7")).toBe(12);
  });
});
