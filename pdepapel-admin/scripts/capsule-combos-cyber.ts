/**
 * Edición Cyber (2026-11-03): los 8 combos «Cápsula sorpresa xN» pasan a «Cápsula sorpresa Cyber xN» y dejan de ser
 * «Próximamente» (availableAt → null) para venderse en la tienda. Mismo SKU, precio, stock y URL (como «Conservar URL»
 * del panel: el slug no cambia, así que no hay alias nuevo). La edición va «hasta agotar existencias»: cuando Paula
 * diga que la urna quedó vacía, los combos se archivan desde Productos.
 *
 * Seguro de correr una sola vez: solo toca un combo que sigue con su nombre y su fecha de antes; si ya cambió, se salta.
 * Los feeds ya excluyen «Kits sorpresa» (1776b7dc) y los combos no tienen publicaciones de Mercado Libre.
 *
 * Stock según la urna (todos los canales venden los mismos combos): disponibles = urna − cápsulas ya comprometidas en
 * pedidos de combos (pendientes o pagados) − 10 % de margen. Se reparten con más peso en x5–x7 y al menos 1 por combo,
 * con Σ(stock × N) ≤ disponibles. El stock final de cada combo suma además las unidades de sus pedidos pendientes, que
 * se descuentan al pagarse; los pagados ya se descontaron. El ajuste va por `createInventoryMovement`
 * (MANUAL_ADJUSTMENT, referencia edicion-cyber-2026-11-03:<SKU>), nunca escribiendo la columna. Paula recarga un combo
 * desde su kardex («Ajustar») mientras queden bolas en la urna.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-combos-cyber.ts --urn 300 --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-combos-cyber.ts --urn 300 --apply --expect new
 *
 * prod-write-models: Product, InventoryMovement, MarketplaceOutboxEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const CAPSULE_CATEGORY_ID = "9bdebb9f-8a23-4bed-a8a4-8e6de8b58f47";
const AVAILABLE_AT = new Date("2027-01-01T05:00:00.000Z");
/** [SKU, cápsulas, precio] de capsule-combos-create.ts (7654cba2). */
const COMBOS: [string, number, number][] = [
  ["KIT-SOR-MUL-S-L-5R5PCN", 5, 40_000],
  ["KIT-SOR-MUL-S-L-DXYIFC", 6, 45_000],
  ["KIT-SOR-MUL-S-L-G9LMLC", 7, 49_000],
  ["KIT-SOR-MUL-S-L-IH6QO7", 8, 54_000],
  ["KIT-SOR-MUL-S-L-5H4AJ7", 9, 58_000],
  ["KIT-SOR-MUL-S-L-8G27HZ", 10, 62_000],
  ["KIT-SOR-MUL-S-L-XNM44P", 12, 72_000],
  ["KIT-SOR-MUL-S-L-IQ0Y5K", 15, 87_000],
];

const MARGIN = 0.1;
/** Parte de las cápsulas disponibles que va a cada tamaño: más peso en x5–x7, los que más se venden. */
const WEIGHTS: Record<number, number> = { 5: 0.22, 6: 0.18, 7: 0.18, 8: 0.1, 9: 0.08, 10: 0.1, 12: 0.07, 15: 0.07 };
const REFERENCE = "edicion-cyber-2026-11-03";
/** Pedidos que ya tienen las cápsulas de su combo: pendientes (descuentan al pagarse) o pagados (ya descontaron). */
const UNPAID_STATUSES = ["CREATED", "PENDING", "DEPOSIT_PAID"] as const;
const PAID_STATUSES = ["PAID", "SENT"] as const;

/** Reparto: 1 por combo, luego por peso, y lo que sobra en x5, x6, x7 (y después en el que quepa). */
export function splitCapsules(available: number, sizes: number[]): Map<number, number> {
  const stock = new Map(sizes.map((n) => [n, 1]));
  const used = () => Array.from(stock).reduce((sum, [n, units]) => sum + n * units, 0);
  if (used() > available) throw new Error(`no alcanzan ${available} cápsulas para 1 de cada combo (${used()}).`);
  const rest = available - used();
  for (const n of sizes) stock.set(n, stock.get(n)! + Math.floor((rest * (WEIGHTS[n] ?? 0)) / n));
  const order = [5, 6, 7, ...sizes.filter((n) => n > 7)].filter((n) => sizes.includes(n));
  for (let added = true; added; ) {
    added = false;
    for (const n of order) {
      if (available - used() >= n) {
        stock.set(n, stock.get(n)! + 1);
        added = true;
      }
    }
  }
  return stock;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const urnIndex = process.argv.indexOf("--urn");
  const urn = urnIndex >= 0 ? Number(process.argv[urnIndex + 1]) : NaN;
  if (!Number.isInteger(urn) || urn <= 0) throw new Error("falta --urn <cápsulas en la urna> (estimado de Paula).");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-combos-cyber.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement } = await import("@/lib/inventory");
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const products = await db.product.findMany({
      where: { storeId: STORE_ID, sku: { in: COMBOS.map(([sku]) => sku) } },
      select: {
        id: true, sku: true, name: true, slug: true, price: true, stock: true, reservedUnits: true, availableAt: true, isArchived: true, categoryId: true,
        _count: { select: { marketplaceListings: true } },
      },
    });
    if (products.length !== COMBOS.length) throw new Error(`se esperaban ${COMBOS.length} combos y hay ${products.length}.`);

    const plan = COMBOS.map(([sku, capsules, price]) => {
      const product = products.find((row) => row.sku === sku)!;
      const from = `Cápsula sorpresa x${capsules}`;
      const to = `Cápsula sorpresa Cyber x${capsules}`;
      if (product.categoryId !== CAPSULE_CATEGORY_ID) throw new Error(`${sku} no está en «Kits sorpresa».`);
      if (product.isArchived) throw new Error(`${sku} está archivado.`);
      if (product.price !== price) throw new Error(`${sku} ya no vale ${price} (vale ${product.price}).`);
      if (product._count.marketplaceListings > 0) throw new Error(`${sku} tiene publicaciones de Mercado Libre.`);
      const done = product.name === to && product.availableAt === null;
      const pending = product.name === from && product.availableAt?.getTime() === AVAILABLE_AT.getTime();
      if (!done && !pending) throw new Error(`${sku} no está como se dejó: «${product.name}», disponible desde ${product.availableAt?.toISOString() ?? "ya"}.`);
      return { id: product.id, sku, from, to, price, stock: product.stock, reserved: product.reservedUnits, url: `/producto/${product.slug}`, estado: done ? "ya hecho" : "por cambiar" };
    });
    console.log(JSON.stringify(plan.map(({ id, ...row }) => row), null, 1));
    const todo = plan.filter((row) => row.estado === "por cambiar");
    console.log(`Renombre: ${plan.length} combos · por cambiar ${todo.length} · ya hechos ${plan.length - todo.length}`);

    // Cápsulas ya comprometidas en pedidos de combos, de cualquier canal.
    const sizeOf = new Map(COMBOS.map(([sku, n]) => [products.find((row) => row.sku === sku)!.id, n]));
    const lines = await db.orderItem.findMany({
      where: { productId: { in: Array.from(sizeOf.keys()) }, order: { storeId: STORE_ID, status: { in: [...UNPAID_STATUSES, ...PAID_STATUSES] } } },
      select: { productId: true, quantity: true, sku: true, order: { select: { orderNumber: true, status: true, salesChannel: true, source: true } } },
    });
    const committed = lines.map((line) => {
      const n = sizeOf.get(line.productId!)!;
      const paid = (PAID_STATUSES as readonly string[]).includes(line.order.status);
      return { pedido: line.order.orderNumber, estado: line.order.status, canal: line.order.salesChannel ?? line.order.source, combo: `x${n}`, cantidad: line.quantity, capsulas: line.quantity * n, pagado: paid, productId: line.productId! };
    });
    const committedCapsules = committed.reduce((sum, row) => sum + row.capsulas, 0);
    const pendingUnits = new Map<string, number>();
    for (const row of committed) if (!row.pagado) pendingUnits.set(row.productId, (pendingUnits.get(row.productId) ?? 0) + row.cantidad);
    const available = Math.floor((urn - committedCapsules) * (1 - MARGIN));
    const split = splitCapsules(available, COMBOS.map(([, n]) => n));

    const done = await db.inventoryMovement.findMany({ where: { storeId: STORE_ID, referenceId: { startsWith: `${REFERENCE}:` } }, select: { referenceId: true } });
    const doneRefs = new Set(done.map((row) => row.referenceId));
    const stockPlan = COMBOS.map(([sku, n]) => {
      const product = products.find((row) => row.sku === sku)!;
      const pending = pendingUnits.get(product.id) ?? 0;
      const target = split.get(n)! + pending;
      return { id: product.id, sku, combo: `x${n}`, stockAntes: product.stock, paraVender: split.get(n)!, pendientes: pending, stockFinal: target, capsulas: split.get(n)! * n, delta: target - product.stock, hecho: doneRefs.has(`${REFERENCE}:${sku}`) };
    });
    const capsulesForSale = stockPlan.reduce((sum, row) => sum + row.capsulas, 0);
    if (capsulesForSale > available) throw new Error(`el reparto (${capsulesForSale}) pasa de las disponibles (${available}).`);
    if (stockPlan.some((row) => row.paraVender < 1)) throw new Error("algún combo quedó en 0 para vender.");
    console.log(JSON.stringify({ urna: urn, comprometidas: committedCapsules, pedidos: committed.map(({ productId, ...row }) => row), margen: `${MARGIN * 100} %`, disponibles: available, enVenta: capsulesForSale }, null, 1));
    console.log(JSON.stringify(stockPlan.map(({ id, ...row }) => row), null, 1));
    const adjust = stockPlan.filter((row) => !row.hecho && row.delta !== 0);
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const changed = await db.$transaction(async (tx) => {
      let count = 0;
      for (const row of todo) {
        const updated = await tx.product.updateMany({
          where: { id: row.id, storeId: STORE_ID, name: row.from, availableAt: AVAILABLE_AT, price: row.price },
          data: { name: row.to, availableAt: null },
        });
        if (updated.count !== 1) throw new Error(`${row.sku} cambió mientras se renombraba; no se escribió nada.`);
        count += 1;
      }
      for (const row of adjust) {
        const fresh = await tx.product.findUniqueOrThrow({ where: { id: row.id }, select: { stock: true, reservedUnits: true } });
        if (fresh.stock !== row.stockAntes) throw new Error(`${row.sku}: el stock cambió (${fresh.stock}); no se escribió nada.`);
        if (row.stockFinal < fresh.reservedUnits) throw new Error(`${row.sku}: quedaría por debajo de sus apartados.`);
        await createInventoryMovement(tx, {
          storeId: STORE_ID,
          productId: row.id,
          type: "MANUAL_ADJUSTMENT",
          quantity: row.delta,
          reason: `Edición Cyber: stock según la urna (~${urn} cápsulas)`,
          description: `${urn} cápsulas estimadas por Paula − ${committedCapsules} ya vendidas − ${MARGIN * 100} % de margen = ${available}; a este combo le tocan ${row.paraVender} para vender${row.pendientes ? ` + ${row.pendientes} de pedidos pendientes` : ""}.`,
          referenceId: `${REFERENCE}:${row.sku}`,
          createdBy: "SYSTEM",
        });
        count += 1;
      }
      return count;
    });
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} capsule-combos-cyber · ${todo.length} combos → «Cápsula sorpresa Cyber xN» y a la venta (availableAt null), mismo SKU, precio y URL · stock por la urna: ${urn} − ${committedCapsules} vendidas − ${MARGIN * 100} % = ${available} cápsulas, ${capsulesForSale} en venta (${stockPlan.map((row) => `${row.combo}=${row.stockFinal}`).join(" ")}) · DESHACER renombrando y poniendo la fecha 2027-01-01 desde Productos y ajustando el stock desde el kardex.\n`,
    );
    console.log(`PROD_WRITE_ROWS=${changed}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
