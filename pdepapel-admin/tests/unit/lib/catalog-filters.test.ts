import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CAPSULAS_SORPRESA_ID, CAPSULAS_SORPRESA_SLUG } from "@/constants";
import {
  BUNDLE_FILTER_CALLERS,
  EXCLUDE_BUNDLE_PRODUCTS,
  EXCLUDE_CAPSULE_PRODUCTS,
  isBundleProduct,
} from "@/lib/catalog-filters";
import { INVENTORY_VIEWS } from "@/lib/inventory-views";

/**
 * Durante meses estos cuatro filtros apuntaron a una categoría que no existía
 * en producción, así que no excluían absolutamente nada y nadie se enteró: un
 * id inventado no falla, simplemente no coincide con ninguna fila.
 *
 * Estas pruebas cierran las dos formas de que vuelva a pasar: que alguien
 * cambie el id por uno que no corresponde a la categoría real, y que una
 * consulta nueva se olvide de usar el fragmento compartido.
 */
const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("la categoría de cápsulas apunta a algo real", () => {
  it("el id es un UUID con forma válida", () => {
    expect(CAPSULAS_SORPRESA_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("el id es el de «Kits sorpresa», verificado contra producción", () => {
    // Si la categoría se recrea, este valor cambia y hay que cambiarlo aquí a
    // conciencia: es justo el paso que faltó la vez pasada.
    expect(CAPSULAS_SORPRESA_ID).toBe("9bdebb9f-8a23-4bed-a8a4-8e6de8b58f47");
    expect(CAPSULAS_SORPRESA_SLUG).toBe("kits-sorpresa");
  });

  it("la tienda reconoce la misma categoría por slug", () => {
    const blindBox = readFileSync(
      join(ROOT, "..", "pdepapel-store", "lib/blind-box.ts"),
      "utf8",
    );
    expect(blindBox).toContain(`"${CAPSULAS_SORPRESA_SLUG}"`);
  });
});

describe("un kit de oficina mal categorizado vuelve a contarse al arreglarlo", () => {
  // El caso real: cuatro «Kit oficina» estaban en «Kits sorpresa», así que
  // Inventario dejó de listarlos. No son cápsulas —nadie empacó un lote con
  // ellos— y su stock es el que hay en la estantería.
  const officeKit = { isKit: false, categoryId: CAPSULAS_SORPRESA_ID };
  const fixed = { isKit: false, categoryId: "kits-de-oficina-id" };

  it("mientras está en «Kits sorpresa» se esconde de las existencias", () => {
    expect(isBundleProduct(officeKit)).toBe(true);
  });

  it("al moverlo fuera vuelve a contarse", () => {
    expect(isBundleProduct(fixed)).toBe(false);
  });
});

describe("el fragmento excluye lo que debe", () => {
  it("deja fuera kits y cápsulas, y deja pasar un producto normal", () => {
    expect(isBundleProduct({ isKit: true, categoryId: "otra" })).toBe(true);
    expect(isBundleProduct({ isKit: false, categoryId: CAPSULAS_SORPRESA_ID })).toBe(true);
    expect(isBundleProduct({ isKit: false, categoryId: "agendas" })).toBe(false);
    expect(isBundleProduct({})).toBe(false);
  });

  it("el fragmento de Prisma filtra por las dos cosas", () => {
    expect(EXCLUDE_BUNDLE_PRODUCTS.isKit).toBe(false);
    expect(EXCLUDE_BUNDLE_PRODUCTS.categoryId).toEqual({ not: CAPSULAS_SORPRESA_ID });
  });
});

describe("las cuatro lecturas de stock usan el fragmento compartido", () => {
  it.each(BUNDLE_FILTER_CALLERS.map((caller) => [caller.file, caller.fragment]))(
    "%s importa y usa %s",
    (file, fragment) => {
      const source = read(file);
      expect(source).toContain(fragment);
      expect(source).toContain(`...${fragment}`);
    },
  );

  it("ninguna de las cuatro filtra por el id a mano", () => {
    // Filtrar a mano es exactamente como se desincronizaron la vez pasada.
    for (const caller of BUNDLE_FILTER_CALLERS) {
      expect(read(caller.file)).not.toContain("CAPSULAS_SORPRESA_ID");
    }
  });

  it("Inventario sigue trayendo los kits, porque tiene una pestaña para ellos", () => {
    // Excluirlos dejaría la pestaña «Kits» vacía para siempre; el doble conteo
    // ahí lo resuelve `inventoryRowValue`, que les da valor cero.
    const inventory = BUNDLE_FILTER_CALLERS.find((caller) =>
      caller.file.includes("get-inventory"),
    );
    expect(inventory?.fragment).toBe("EXCLUDE_CAPSULE_PRODUCTS");
    expect(EXCLUDE_CAPSULE_PRODUCTS).not.toHaveProperty("isKit");
    expect(read(inventory!.file)).not.toContain("EXCLUDE_BUNDLE_PRODUCTS");
    expect(INVENTORY_VIEWS.map((view) => view.id)).toContain("kits");
  });

  it("KITS_ID quedó retirado: para «esto es un kit» está la columna isKit", () => {
    const constants = read("constants/index.ts");
    expect(constants).not.toMatch(/^export const KITS_ID/m);
  });
});
