/**
 * Conteo físico de un producto: deja el stock en lo que se contó, por el mismo
 * camino del ajuste del panel (`createInventoryMovement`, MANUAL_ADJUSTMENT):
 * escribe el movimiento en el kardex, encola la sincronización de stock de
 * Mercado Libre si hay publicaciones y refresca la tienda después del commit.
 * Nunca un UPDATE directo.
 *
 * Ensayo (por defecto; no escribe nada; corre con pdepapel_ro):
 *   npm run prod:write -- --dry-run scripts/inventory-physical-count.ts --sku <SKU> --count <N> --motivo "<texto>" --reason "<motivo de la aprobación>" --expect new
 * Corrida real:
 *   npm run prod:write -- scripts/inventory-physical-count.ts --sku <SKU> --count <N> --motivo "<texto>" --apply --expect new
 *
 * Se niega si el producto es un kit, está archivado, tiene apartados activos o convertidos (guardan unidades hasta el pago) o
 * unidades comprometidas con una preventa: esas unidades tienen dueña y bajar
 * el stock por debajo de ellas se decide a mano, no en un conteo.
 *
 * prod-write-models: Product, InventoryMovement, MarketplaceOutboxEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { createInventoryMovement } from "@/lib/inventory";
import { invalidateStoreProductsCache } from "@/lib/cache";

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
  const sku = argValue(args, "--sku");
  const countText = argValue(args, "--count");
  const motivo = argValue(args, "--motivo")?.trim();
  const apply = args.includes("--apply");
  const storeId = argValue(args, "--store") ?? DEFAULT_STORE_ID;
  if (!sku || countText === null || !motivo) throw new Error("faltan --sku, --count o --motivo.");
  const count = Number(countText);
  if (!Number.isInteger(count) || count < 0) throw new Error("--count debe ser un entero ≥ 0.");

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/inventory-physical-count.ts … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const product = await db.product.findFirst({
      where: { storeId, sku },
      select: { id: true, name: true, stock: true, reservedUnits: true, isKit: true, isArchived: true },
    });
    if (!product) throw new Error(`no hay producto con SKU ${sku}.`);
    const [activeHolds, presaleUnits, listings] = await Promise.all([
      db.stockReservationItem.count({ where: { productId: product.id, reservation: { status: { in: ["ACTIVE", "CONVERTED"] } } } }),
      db.productPresale.findMany({ where: { productId: product.id, status: "ACTIVE" }, select: { committedUnits: true } }),
      db.marketplaceListing.findMany({ where: { productId: product.id }, select: { id: true, status: true, externalItemId: true, syncStock: true } }),
    ]);
    const committed = presaleUnits.reduce((total, row) => total + (row.committedUnits ?? 0), 0);
    const delta = count - product.stock;
    const problems = [
      product.isKit ? "es un kit (su stock sale de los componentes)" : null,
      product.isArchived ? "está archivado" : null,
      activeHolds > 0 || product.reservedUnits > 0 ? `tiene apartados activos (${activeHolds} líneas, ${product.reservedUnits} unidades)` : null,
      committed > 0 ? `tiene ${committed} unidades comprometidas con una preventa` : null,
    ].filter(Boolean);

    console.log(
      JSON.stringify(
        {
          sku,
          producto: product.name,
          stockActual: product.stock,
          conteo: count,
          ajuste: delta,
          motivo,
          publicacionesMercadoLibre: listings.map((listing) => ({ id: listing.id, estado: listing.status, item: listing.externalItemId, sincronizaStock: listing.syncStock })),
          bloqueos: problems,
        },
        null,
        1,
      ),
    );
    if (problems.length) throw new Error(`no se ajusta: ${problems.join("; ")}.`);
    if (!apply) {
      console.log(delta === 0 ? "Sin cambio: el stock ya coincide con el conteo." : `Ensayo: se registraría un ajuste de ${delta} (${product.stock} → ${count}).`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (delta === 0) {
      console.log("Sin cambio: el stock ya coincide con el conteo.");
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const movement = await db.$transaction((tx) =>
      createInventoryMovement(tx, {
        storeId,
        productId: product.id,
        type: "MANUAL_ADJUSTMENT",
        quantity: delta,
        reason: motivo,
        description: `Conteo físico: ${count} unidades (había ${product.stock} en el sistema).`,
        createdBy: "SYSTEM",
      }),
    );
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} inventory-physical-count ${sku} ${product.stock} → ${count} · movimiento ${movement.id} · DESHACER con otro ajuste de ${-delta} desde el panel (Inventario), nunca borrando el movimiento.\n`,
    );
    await invalidateStoreProductsCache(storeId, product.id);
    console.log(`Ajustado: ${sku} ${product.stock} → ${count} (movimiento ${movement.id}).`);
    console.log("PROD_WRITE_ROWS=1");
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
