import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveUnitPrice } from "@/lib/price-tiers";

/**
 * La tienda calcula el total en el navegador mientras el comprador sube la
 * cantidad; el panel lo vuelve a calcular en el servidor al cobrar. Si las dos
 * cuentas se separan, el cliente ve un precio y se le cobra otro.
 *
 * Como no hay paquete compartido entre las dos aplicaciones, la garantía es
 * esta: el archivo de reglas es BYTE A BYTE el mismo en las dos. Esta prueba
 * falla en el momento en que alguien edita una sola copia.
 */
const STORE_COPY = join(process.cwd(), "lib/price-tiers.ts");
const ADMIN_COPY = join(process.cwd(), "..", "pdepapel-admin", "lib/price-tiers.ts");

describe("price-tiers: la tienda y el panel usan las mismas reglas", () => {
  it("el archivo es idéntico en las dos aplicaciones", () => {
    const store = readFileSync(STORE_COPY, "utf8");
    const admin = readFileSync(ADMIN_COPY, "utf8");
    // Mensaje explícito: si esto falla, lo que hay que hacer es copiar, no parchear.
    expect(
      store === admin
        ? "idénticos"
        : "pdepapel-store/lib/price-tiers.ts y pdepapel-admin/lib/price-tiers.ts se separaron: copia uno sobre el otro",
    ).toBe("idénticos");
  });

  it("la copia de la tienda calcula lo que se espera", () => {
    // El mismo caso que la prueba del panel: oferta y peldaño nunca se suman.
    const tiers = [{ minQuantity: 10, unitPrice: 9000 }];
    expect(
      resolveUnitPrice({ basePrice: 10000, offerPrice: 8500, tiers, quantity: 12 })
        .unitPrice,
    ).toBe(8500);
    expect(
      resolveUnitPrice({ basePrice: 10000, offerPrice: 9500, tiers, quantity: 12 })
        .unitPrice,
    ).toBe(9000);
    expect(resolveUnitPrice({ basePrice: 10000, tiers, quantity: 9 }).unitPrice).toBe(
      10000,
    );
  });
});
