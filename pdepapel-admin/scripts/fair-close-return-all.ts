/**
 * Cierra una feria sin ventas devolviendo todo lo reservado, por los mismos
 * pasos del panel: «Abrir» (`openFairEvent`), «Conciliar»
 * (`startFairReconciliation`) y cerrar (`reconcileFairEvent`) con cada fila
 * contada como devuelta. El cierre escribe un `FESTIVAL_RETURN` por pieza de
 * cada kit (y por producto suelto) y deja la feria CLOSED. No toca los
 * productos kit (siguen archivados) ni otros ajustes.
 *
 * Ensayo (no escribe; pdepapel_ro): muestra, por pieza, el stock de hoy, lo
 * que vuelve y el stock final esperado frente al que tenía justo antes de la
 * reserva de la feria (`previousStock` de su primer FESTIVAL_ALLOCATION).
 *   npm run prod:write -- --dry-run scripts/fair-close-return-all.ts --fair <id> --expect-rows <n> --expect-units <n> --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- scripts/fair-close-return-all.ts --fair <id> --expect-rows <n> --expect-units <n> --apply --expect new
 *
 * Se niega si la feria tiene ventas, cápsulas, filas o unidades distintas de
 * las esperadas, o no está en DRAFT u OPEN.
 *
 * prod-write-models: FairEvent, FairEventInventoryItem, InventoryMovement, Product, MarketplaceOutboxEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

const argValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

async function main() {
  const args = process.argv.slice(2);
  const fairEventId = argValue(args, "--fair");
  const expectRows = Number(argValue(args, "--expect-rows"));
  const expectUnits = Number(argValue(args, "--expect-units"));
  const storeId = argValue(args, "--store") ?? DEFAULT_STORE_ID;
  const apply = args.includes("--apply");
  if (!fairEventId || !Number.isInteger(expectRows) || !Number.isInteger(expectUnits)) throw new Error("faltan --fair, --expect-rows o --expect-units.");

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/fair-close-return-all.ts … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  // Mismas opciones de transacción que `lib/prismadb.ts`.
  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  // Los helpers del panel usan el cliente global: en la corrida real es el cliente con guardas.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { openFairEvent, startFairReconciliation, reconcileFairEvent } = await import("@/lib/fair-events");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const fair = await db.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      select: { id: true, name: true, status: true, _count: { select: { orders: true, capsules: true } } },
    });
    if (!fair) throw new Error("la feria no existe en esta tienda.");
    const rows = await db.fairEventInventoryItem.findMany({
      where: { fairEventId },
      select: {
        productId: true,
        allocatedQuantity: true,
        soldQuantity: true,
        packedQuantity: true,
        product: { select: { sku: true, name: true, isKit: true, isArchived: true } },
        kitComponents: { select: { componentId: true, quantityPerKit: true } },
      },
    });
    const units = rows.reduce((sum, row) => sum + row.allocatedQuantity, 0);

    const back = new Map<string, number>();
    for (const row of rows) {
      const returned = row.allocatedQuantity - row.soldQuantity;
      if (row.kitComponents.length) for (const line of row.kitComponents) back.set(line.componentId, (back.get(line.componentId) ?? 0) + returned * line.quantityPerKit);
      else back.set(row.productId, (back.get(row.productId) ?? 0) + returned);
    }
    const ids = Array.from(back.keys());
    const [pieces, firstAllocations, later] = await Promise.all([
      db.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, name: true, stock: true } }),
      db.inventoryMovement.findMany({ where: { referenceId: fairEventId, type: "FESTIVAL_ALLOCATION", productId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { productId: true, previousStock: true, createdAt: true } }),
      db.inventoryMovement.findMany({ where: { productId: { in: ids }, NOT: { referenceId: fairEventId } }, orderBy: { createdAt: "asc" }, select: { productId: true, type: true, quantity: true, createdAt: true } }),
    ]);
    const before = new Map<string, { previousStock: number; at: Date }>();
    for (const m of firstAllocations) if (m.productId && !before.has(m.productId)) before.set(m.productId, { previousStock: m.previousStock ?? 0, at: m.createdAt });
    const stock = pieces.map((p) => {
      const ref = before.get(p.id);
      const since = ref ? later.filter((m) => m.productId === p.id && m.createdAt > ref.at) : [];
      const final = p.stock + (back.get(p.id) ?? 0);
      return { sku: p.sku, nombre: p.name, stockHoy: p.stock, vuelve: back.get(p.id) ?? 0, stockFinal: final, antesDeLaReserva: ref?.previousStock ?? null, movimientosDespues: since.map((m) => `${m.type} ${m.quantity}`), cuadra: ref ? final === ref.previousStock + since.reduce((sum, m) => sum + m.quantity, 0) : null };
    });

    const problems = [
      fair.status !== "DRAFT" && fair.status !== "OPEN" ? `la feria está ${fair.status}` : null,
      fair._count.orders ? `la feria tiene ${fair._count.orders} ventas` : null,
      fair._count.capsules ? `la feria tiene ${fair._count.capsules} cápsulas` : null,
      rows.length !== expectRows ? `filas ${rows.length}, se esperaban ${expectRows}` : null,
      units !== expectUnits ? `unidades ${units}, se esperaban ${expectUnits}` : null,
      rows.some((row) => row.soldQuantity || row.packedQuantity) ? "hay filas con vendidas o empacadas" : null,
      stock.some((row) => row.cuadra === false) ? "alguna pieza no vuelve al stock que tenía antes de la reserva" : null,
    ].filter(Boolean);

    console.log(JSON.stringify({ feria: { nombre: fair.name, estado: fair.status }, filas: rows.length, unidades: units, kits: rows.filter((r) => r.product.isKit).length, kitsArchivados: rows.filter((r) => r.product.isArchived).length, piezas: stock, bloqueos: problems }, null, 1));
    if (problems.length) throw new Error(`no se cierra: ${problems.join("; ")}.`);
    if (!apply) {
      console.log(`Ensayo: se abriría, conciliaría y cerraría «${fair.name}» devolviendo ${units} unidades (${ids.length} piezas, ${stock.reduce((s, r) => s + r.vuelve, 0)} unidades al stock).`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    if (fair.status === "DRAFT") await openFairEvent({ storeId, fairEventId });
    await startFairReconciliation({ storeId, fairEventId });
    await reconcileFairEvent({
      storeId,
      fairEventId,
      items: rows.map((row) => ({ productId: row.productId, returnedQuantity: row.allocatedQuantity - row.soldQuantity, damagedQuantity: 0, lostQuantity: 0 })),
      userId: "SYSTEM",
    });
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} fair-close-return-all «${fair.name}» ${fairEventId} · ${rows.length} filas / ${units} unidades devueltas (${ids.length} piezas) · feria CLOSED sin ventas · los kits siguen archivados.\n`,
    );
    console.log(`Cerrada «${fair.name}»: ${units} unidades devueltas.`);
    console.log(`PROD_WRITE_ROWS=${ids.length + rows.length + 1}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
