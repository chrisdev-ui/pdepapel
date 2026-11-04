/**
 * Edición Cyber (2026-11-03): los 8 combos «Cápsula sorpresa xN» pasan a «Cápsula sorpresa Cyber xN» y dejan de ser
 * «Próximamente» (availableAt → null) para venderse en la tienda. Mismo SKU, precio, stock y URL (como «Conservar URL»
 * del panel: el slug no cambia, así que no hay alias nuevo). La edición va «hasta agotar existencias»: cuando Paula
 * diga que la urna quedó vacía, los combos se archivan desde Productos.
 *
 * Seguro de correr una sola vez: solo toca un combo que sigue con su nombre y su fecha de antes; si ya cambió, se salta.
 * Los feeds ya excluyen «Kits sorpresa» (1776b7dc) y los combos no tienen publicaciones de Mercado Libre.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-combos-cyber.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-combos-cyber.ts --apply --expect new
 *
 * prod-write-models: Product
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

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

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-combos-cyber.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
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
    console.log(`Resumen: ${plan.length} combos · por cambiar ${todo.length} · ya hechos ${plan.length - todo.length}`);
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
      return count;
    });
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} capsule-combos-cyber · ${changed} combos «Cápsula sorpresa xN» → «Cápsula sorpresa Cyber xN» y a la venta (availableAt null); mismo SKU, precio, stock y URL · DESHACER renombrando y poniendo la fecha 2027-01-01 desde Productos.\n`,
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
