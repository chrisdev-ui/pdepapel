import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un `cookies()` o `headers()` en la ficha la vuelve dinámica aunque exporte
 * `revalidate`: cada visita y cada rastreo pasaban por la API sin caché
 * (producción, 2026-10-05: `cache-control: private, no-store`, MISS siempre).
 * La cookie de acceso anticipado se lee en el cliente (`useEarlyAccess`).
 */
describe("/producto/[slug] stays cacheable", () => {
  const source = readFileSync(
    join(__dirname, "../../../app/(routes)/producto/[slug]/page.tsx"),
    "utf8",
  );

  it("does not read request cookies or headers on the server", () => {
    expect(source).not.toMatch(/from\s+["']next\/headers["']/);
    expect(source).not.toMatch(/\b(cookies|headers|draftMode)\(\)/);
    expect(source).not.toMatch(/unstable_noStore|force-dynamic/);
  });

  it("keeps the five-minute ISR window", () => {
    expect(source).toMatch(/export const revalidate = 300;/);
  });

  /**
   * Sin `generateStaticParams`, Next 14 renderiza la ruta dinámica en cada
   * visita aunque exporte `revalidate`: era la causa principal de la ficha
   * sin caché, más que la cookie.
   */
  it("opts the dynamic segment into on-demand ISR with generateStaticParams", () => {
    expect(source).toMatch(/export function generateStaticParams\(\)\s*\{\s*return \[\];\s*\}/);
    expect(source).not.toMatch(/export const dynamicParams = false/);
  });
});
