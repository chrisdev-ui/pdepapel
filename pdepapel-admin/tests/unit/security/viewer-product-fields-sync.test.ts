import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { INTERNAL_PRODUCT_FIELDS } from "@/lib/public-catalog";
import { VIEWER_HIDDEN_PRODUCT_FIELDS } from "@/lib/viewer-payloads";

import { VIEWER_KEYS } from "../../helpers/forbidden-keys";

/**
 * La lista que vigilan las pruebas (VIEWER_KEYS) y la que quita de verdad el
 * panel (INTERNAL_PRODUCT_FIELDS, la de `scrubProduct`) son dos listas: el
 * 2026-10-31 una columna nueva entró en la de pruebas y no en la del panel, y
 * solo lo vio la integración en CI. Aquí falla al instante.
 */
const PRODUCT_COLUMNS = new Set<string>(Object.values(Prisma.ProductScalarFieldEnum));
// Ocultas al público pero no son secreto para la cuenta de solo lectura (aparecen en muchos objetos).
const PUBLIC_ONLY = new Set(["storeId", "hasNoProductIdentifier"]);

describe("campos internos de Product: pruebas y panel dicen lo mismo", () => {
  it("el panel quita exactamente la lista interna", () => {
    expect([...VIEWER_HIDDEN_PRODUCT_FIELDS]).toEqual([...INTERNAL_PRODUCT_FIELDS]);
  });

  it("toda columna de Product que las pruebas prohíben a la cuenta de solo lectura, el panel la quita", () => {
    const missing = VIEWER_KEYS.filter((key) => PRODUCT_COLUMNS.has(key) && !(INTERNAL_PRODUCT_FIELDS as readonly string[]).includes(key));
    expect(missing).toEqual([]);
  });

  it("toda columna interna (salvo las solo públicas) está también en la lista de las pruebas", () => {
    const missing = INTERNAL_PRODUCT_FIELDS.filter((key) => PRODUCT_COLUMNS.has(key) && !PUBLIC_ONLY.has(key) && !VIEWER_KEYS.includes(key));
    expect(missing).toEqual([]);
  });

  it("una columna «…By» de Product (un id de Clerk) nunca sale a la cuenta de solo lectura", () => {
    const byColumns = Array.from(PRODUCT_COLUMNS).filter((key) => key.endsWith("By"));
    expect(byColumns.length).toBeGreaterThan(0);
    expect(byColumns.filter((key) => !(INTERNAL_PRODUCT_FIELDS as readonly string[]).includes(key))).toEqual([]);
  });
});
