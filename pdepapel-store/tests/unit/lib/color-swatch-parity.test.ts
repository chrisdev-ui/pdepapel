import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La muestra que ve la clienta (tienda) y la vista previa que ve Paula al
 * elegir el «Tipo de muestra» (panel) salen del mismo archivo. Sin paquete
 * compartido entre las dos aplicaciones, la garantía es que sea BYTE A BYTE
 * el mismo: esta prueba falla en cuanto alguien edita una sola copia.
 */
const STORE_COPY = join(process.cwd(), "lib/color-swatch.ts");
const ADMIN_COPY = join(process.cwd(), "..", "pdepapel-admin", "lib/color-swatch.ts");

describe("color-swatch: la tienda y el panel pintan igual", () => {
  it("el archivo es idéntico en las dos aplicaciones", () => {
    const store = readFileSync(STORE_COPY, "utf8");
    const admin = readFileSync(ADMIN_COPY, "utf8");
    expect(
      store === admin
        ? "idénticos"
        : "pdepapel-store/lib/color-swatch.ts y pdepapel-admin/lib/color-swatch.ts se separaron: copia uno sobre el otro",
    ).toBe("idénticos");
  });
});
