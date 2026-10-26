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
// Definiciones, y `orphan-guides`: vincula dentro de la transacción de quien
// llama, así que el aviso lo manda quien llama después de confirmar (y
// `linkOrphanGuide(` está en MOVES para exigírselo).
const DEFINITIONS = new Set(["lib/shipping-helpers.ts", "lib/shipment-status-apply.ts", "lib/orphan-guides.ts"]);
const MOVES = /\b(createGuideForOrder|applyShipmentStatus|linkOrphanGuide)\(/;
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
        "app/api/[storeId]/shipments/orphan-guides/[idOrder]/route.ts",
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

/**
 * Regresión del 26 oct (hotfix): el cambio en lote del estado del envío desde
 * la lista de Pedidos escribía `updateData.shipping` sin avisar, y la prueba de
 * arriba no lo veía porque solo busca las funciones que crean guías. Toda
 * escritura de un estado de envío (que no sea volver a «Preparando») tiene que
 * avisar en el mismo handler exportado que la hace.
 */
const SHIPPING_WRITE = /(\bshipping\.(?:update|updateMany|upsert)\(|updateData\.shipping\s*=|\bshipping:\s*\{\s*(?:update|upsert)\s*:)/g;
const EXPORTED = /^export (?:async )?function \w+|^export const \w+ = async/gm;

function exportedBlocks(text: string): string[] {
  const starts = Array.from(text.matchAll(EXPORTED), (m) => m.index ?? 0);
  if (starts.length === 0) return [text];
  return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length));
}

function writesShippingStatus(block: string): boolean {
  for (const match of Array.from(block.matchAll(SHIPPING_WRITE))) {
    const window = block.slice(match.index ?? 0, (match.index ?? 0) + 400);
    const status = /\bstatus\s*:\s*([^,}\n]+)/.exec(window);
    if (status && !/^ShippingStatus\.Preparing\b/.test(status[1].trim())) return true;
  }
  return false;
}

describe("toda escritura de un estado de envío avisa en el mismo handler", () => {
  const offenders = (rel: string) =>
    exportedBlocks(readFileSync(join(ROOT, rel), "utf8")).filter((block) => writesShippingStatus(block) && !NOTIFIES.test(block));
  const writers = SOURCES.flatMap((dir) => walk(join(ROOT, dir)))
    .map((path) => relative(ROOT, path))
    .filter((rel) => !DEFINITIONS.has(rel) && exportedBlocks(readFileSync(join(ROOT, rel), "utf8")).some(writesShippingStatus));

  it("encuentra la página del pedido y la lista de pedidos", () => {
    expect(writers).toEqual(expect.arrayContaining(["app/api/[storeId]/orders/[orderId]/route.ts", "app/api/[storeId]/orders/route.ts"]));
  });

  it.each(writers)("%s avisa donde mueve el envío", (rel) => {
    expect(offenders(rel).map((block) => block.slice(0, 60))).toEqual([]);
  });

  it("detecta el caso del lote sin aviso", () => {
    const bulkWithoutNotice = "export async function PATCH() {\n  if (shipping) {\n    updateData.shipping = { update: { status: shipping } };\n  }\n}\n";
    expect(writesShippingStatus(bulkWithoutNotice)).toBe(true);
    expect(NOTIFIES.test(bulkWithoutNotice)).toBe(false);
    expect(writesShippingStatus("await tx.shipping.update({ data: { status: ShippingStatus.Preparing } })")).toBe(false);
  });
});

