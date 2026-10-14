import { describe, expect, it } from "vitest";

import { shouldReloadOnNavigation } from "@/lib/version-guard";

describe("recarga al cambiar de pantalla con una versión vieja", () => {
  it("solo con pestaña vieja y otra pantalla; la misma pantalla con otros filtros no recarga", () => {
    const stale = { stale: true, staleAtPath: "/s/pedidos" };
    expect(shouldReloadOnNavigation(stale, "/s/productos")).toBe(true);
    expect(shouldReloadOnNavigation(stale, "/s/pedidos")).toBe(false);
    expect(shouldReloadOnNavigation({ stale: false, staleAtPath: null }, "/s/productos")).toBe(false);
    expect(shouldReloadOnNavigation({ stale: true, staleAtPath: null }, "/s/productos")).toBe(false);
    expect(shouldReloadOnNavigation(stale, null)).toBe(false);
  });
});
