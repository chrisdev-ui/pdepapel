import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresión del 26 oct: crear una guía no avisaba a la clienta y la edición en
 * lote de Envíos tampoco. Toda ruta que crea una guía o mueve un envío tiene
 * que pasar por el notificador (lib/shipment-notifications.ts). Si se agrega
 * una ruta nueva sin aviso, esta prueba la nombra.
 */
const ROOT = join(__dirname, "..", "..", "..");
const SOURCES = ["app", "lib"];
const DEFINITIONS = new Set(["lib/shipping-helpers.ts", "lib/shipment-status-apply.ts"]);
const MOVES = /\b(createGuideForOrder|applyShipmentStatus)\(/;
const NOTIFIES = /\b(notifyShipmentMilestone|queueShipmentMilestone|queueShipmentStatusChange|queueAppliedShipmentChanges)\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("toda ruta que crea una guía o mueve un envío avisa a la clienta", () => {
  const files = SOURCES.flatMap((dir) => walk(join(ROOT, dir)))
    .map((path) => ({ rel: relative(ROOT, path), text: readFileSync(path, "utf8") }))
    .filter(({ rel, text }) => !DEFINITIONS.has(rel) && MOVES.test(text));

  it("encuentra las rutas conocidas", () => {
    const rels = files.map((f) => f.rel);
    expect(rels).toEqual(
      expect.arrayContaining([
        "app/api/webhook/envioclick/route.ts",
        "app/api/[storeId]/shipments/bulk-update/route.ts",
        "app/api/[storeId]/shipments/bulk-manual-update/route.ts",
        "app/api/[storeId]/shipments/sync/route.ts",
        "app/api/[storeId]/shipment/track/route.ts",
        "app/api/[storeId]/orders/[orderId]/shipping/create-guide/route.ts",
        "app/api/[storeId]/orders/[orderId]/shipping/requote-and-guide/route.ts",
        "lib/guide-background.ts",
      ]),
    );
  });

  it.each(SOURCES.flatMap((dir) => walk(join(ROOT, dir))).map((p) => relative(ROOT, p)).filter((rel) => !DEFINITIONS.has(rel) && MOVES.test(readFileSync(join(ROOT, rel), "utf8"))))(
    "%s llama al notificador",
    (rel) => {
      expect(NOTIFIES.test(readFileSync(join(ROOT, rel), "utf8"))).toBe(true);
    },
  );
});
