/**
 * Limpieza de Mercado Libre del issue #8 (2026-10-07), en una sola transacción:
 *   1. Estado de las publicaciones: lee el estado real de cada publicación
 *      vinculada en Mercado Libre (GET de solo lectura, en lotes de 20) y pone
 *      el local igual cuando difiere. Esperado: al menos las cuatro «Activa»
 *      que Mercado Libre pausó sola al quedar sin stock.
 *   2. La venta 2000017890359944: «Inventario con excepción» → «sin aplicar»,
 *      solo si está cancelada y nunca descontó inventario.
 *
 * Ensayo (no escribe; vale con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/mercadolibre-reconcile-listings.ts
 *
 * Escritura (aprobación fresca de Christian; el motivo debe nombrar
 * «MarketplaceOrder», que es modelo del libro mayor):
 *   npm run prod:write -- scripts/mercadolibre-reconcile-listings.ts --apply --expect new
 *
 * El token de Mercado Libre NUNCA se renueva desde aquí: el refresh token es
 * de un solo uso, y renovarlo con una base que no puede guardar el nuevo (el
 * usuario de solo lectura del ensayo) dejaría a producción sin conexión. Si
 * el token de acceso vence en menos de cinco minutos, el guion se detiene y
 * hay que esperar a que producción lo renueve en su próxima llamada.
 *
 * La clave para descifrar el token se lee de `.env` (solo esa variable; nunca
 * se imprime). Antes de escribir anota los valores de antes y el SQL para
 * deshacer en `ops/prod-writes.log`.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MarketplaceListingStatus, PrismaClient } from "@prisma/client";

import { decryptMercadoLibreToken } from "@/lib/mercadolibre/crypto";
import { getMarketplaceListingStatusFromRemote } from "@/lib/mercadolibre/listings";

import { createProdClient } from "./lib/prod-client.mjs";

const PRODUCTION_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const SALE_EXTERNAL_ID = "2000017890359944";
const BATCH = 20;
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** Estados locales que reflejan Mercado Libre (los mismos que lib/mercadolibre/item-sync.ts). */
const MIRRORED: MarketplaceListingStatus[] = ["ACTIVE", "PAUSED", "CLOSED"];

function encryptionKey(): string {
  const fromEnv = process.env.MERCADOLIBRE_TOKEN_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;
  // Bajo prod:write el entorno no trae .env: se lee SOLO esta variable, sin
  // tocar DATABASE_URL (que ahí es la de escritura).
  const line = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("MERCADOLIBRE_TOKEN_ENCRYPTION_KEY="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("falta MERCADOLIBRE_TOKEN_ENCRYPTION_KEY en .env");
  return value;
}

type RemoteItem = { id: string; status: string | null; subStatus: string[] };

async function readRemoteItems(accessToken: string, ids: string[]): Promise<Map<string, RemoteItem | { error: string }>> {
  const result = new Map<string, RemoteItem | { error: string }>();
  for (let index = 0; index < ids.length; index += BATCH) {
    const batch = ids.slice(index, index + BATCH);
    const url = `https://api.mercadolibre.com/items?ids=${batch.map(encodeURIComponent).join(",")}&attributes=id,status,sub_status`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Mercado Libre respondió ${response.status} al leer ${batch.length} publicaciones`);
    const payload = (await response.json()) as { code: number; body: { id?: string; status?: string; sub_status?: string[]; message?: string } }[];
    batch.forEach((id, position) => {
      const entry = payload.find((item) => item.body?.id === id) ?? payload[position];
      if (!entry || entry.code !== 200 || !entry.body) {
        result.set(id, { error: `código ${entry?.code ?? "?"}${entry?.body?.message ? `: ${entry.body.message}` : ""}` });
      } else {
        result.set(id, { id, status: entry.body.status ?? null, subStatus: entry.body.sub_status ?? [] });
      }
    });
  }
  return result;
}

const sqlString = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) {
    throw new Error("--apply solo corre con `npm run prod:write -- scripts/mercadolibre-reconcile-listings.ts --apply --expect new`.");
  }
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    const connection = await db.marketplaceConnection.findUniqueOrThrow({
      where: { storeId_provider: { storeId: PRODUCTION_STORE_ID, provider: "MERCADOLIBRE" } },
      select: { id: true, status: true, encryptedAccessToken: true, accessTokenExpiresAt: true },
    });
    console.log(`Conexión ${connection.id} (${connection.status}) · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
    if (!connection.encryptedAccessToken || !connection.accessTokenExpiresAt) throw new Error("la conexión no tiene token de acceso");
    if (connection.accessTokenExpiresAt.getTime() <= Date.now() + TOKEN_MARGIN_MS) {
      console.log(
        `\nEl token de acceso venció o vence en menos de 5 min (${connection.accessTokenExpiresAt.toISOString()}).` +
          "\nNo se renueva desde aquí (el refresh token es de un solo uso): espera a que producción lo renueve en su próxima llamada a Mercado Libre y vuelve a correr.",
      );
      console.log("PROD_WRITE_ROWS=0");
      process.exitCode = 2;
      return;
    }
    const accessToken = decryptMercadoLibreToken(connection.encryptedAccessToken, encryptionKey());

    // 1. Publicaciones
    const listings = await db.marketplaceListing.findMany({
      where: { connectionId: connection.id, externalItemId: { not: null } },
      select: { id: true, externalItemId: true, status: true, title: true, updatedAt: true, lastRemoteUpdateAt: true, product: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const remote = await readRemoteItems(accessToken, listings.map((listing) => listing.externalItemId!));
    const listingChanges: { id: string; externalItemId: string; name: string; from: MarketplaceListingStatus; to: MarketplaceListingStatus; remote: string; lastRemoteUpdateAt: Date | null }[] = [];
    const notes: string[] = [];
    console.log(`\nPublicaciones vinculadas: ${listings.length}`);
    for (const listing of listings) {
      const item = remote.get(listing.externalItemId!);
      const name = listing.product.name;
      if (!item || "error" in item) {
        notes.push(`  ${listing.externalItemId} «${name}»: no se pudo leer (${item && "error" in item ? item.error : "sin respuesta"}); no se toca`);
        continue;
      }
      const mapped = getMarketplaceListingStatusFromRemote(item.status).status;
      const remoteLabel = `${item.status}${item.subStatus.length ? ` (${item.subStatus.join(", ")})` : ""}`;
      if (!MIRRORED.includes(listing.status)) {
        notes.push(`  ${listing.externalItemId} «${name}»: local ${listing.status}, Mercado Libre ${remoteLabel}; no se toca (estado local que no refleja Mercado Libre)`);
        continue;
      }
      if (mapped === listing.status) {
        console.log(`  = ${listing.externalItemId} «${name}»: ${listing.status} (Mercado Libre ${remoteLabel})`);
        continue;
      }
      listingChanges.push({ id: listing.id, externalItemId: listing.externalItemId!, name, from: listing.status, to: mapped, remote: remoteLabel, lastRemoteUpdateAt: listing.lastRemoteUpdateAt });
    }
    if (notes.length) console.log(`\nSin cambio por otro motivo:\n${notes.join("\n")}`);
    console.log(`\nCambios de estado (${listingChanges.length}):`);
    for (const change of listingChanges) {
      console.log(`  ${change.externalItemId} «${change.name}»: ${change.from} → ${change.to} (Mercado Libre ${change.remote}) [listing ${change.id}]`);
    }

    // 2. La venta cancelada
    const sale = await db.marketplaceOrder.findUnique({
      where: { connectionId_externalOrderId: { connectionId: connection.id, externalOrderId: SALE_EXTERNAL_ID } },
      select: { id: true, status: true, inventoryStatus: true, inventoryError: true, inventoryAppliedAt: true, inventoryRestockedAt: true },
    });
    const problems: string[] = [];
    let saleChange: { id: string; fromStatus: string; fromError: string | null } | null = null;
    if (!sale) {
      problems.push(`la venta ${SALE_EXTERNAL_ID} no existe`);
    } else {
      const movements = await db.inventoryMovement.count({
        where: { OR: [{ referenceId: sale.id }, { reason: { contains: SALE_EXTERNAL_ID } }] },
      });
      console.log(
        `\nVenta ${SALE_EXTERNAL_ID} [${sale.id}]: estado ${sale.status}, inventario ${sale.inventoryStatus}, aplicado ${sale.inventoryAppliedAt?.toISOString() ?? "nunca"}, devuelto ${sale.inventoryRestockedAt?.toISOString() ?? "nunca"}, movimientos de kardex ${movements}, error «${sale.inventoryError ?? ""}»`,
      );
      if (sale.inventoryStatus === "NOT_APPLIED" && !sale.inventoryError) {
        console.log("  ya está en NOT_APPLIED; no hay nada que cambiar");
      } else {
        if (sale.status !== "CANCELLED") problems.push(`la venta no está cancelada (${sale.status})`);
        if (sale.inventoryStatus !== "EXCEPTION") problems.push(`el inventario no está en EXCEPTION (${sale.inventoryStatus})`);
        if (sale.inventoryAppliedAt) problems.push("la venta sí aplicó inventario");
        if (movements > 0) problems.push(`hay ${movements} movimientos de kardex de esta venta`);
        saleChange = { id: sale.id, fromStatus: sale.inventoryStatus, fromError: sale.inventoryError };
        console.log(`  inventoryStatus: ${sale.inventoryStatus} → NOT_APPLIED; inventoryError: «${sale.inventoryError ?? ""}» → NULL`);
      }
    }

    const rollback = [
      ...listingChanges.map((change) => `UPDATE \`MarketplaceListing\` SET \`status\` = '${change.from}' WHERE \`id\` = '${change.id}' AND \`status\` = '${change.to}';`),
      ...(saleChange
        ? [`UPDATE \`MarketplaceOrder\` SET \`inventoryStatus\` = '${saleChange.fromStatus}', \`inventoryError\` = ${sqlString(saleChange.fromError)} WHERE \`id\` = '${saleChange.id}' AND \`inventoryStatus\` = 'NOT_APPLIED';`]
        : []),
    ];
    console.log("\nSQL para deshacer:");
    for (const statement of rollback) console.log(`  ${statement}`);

    if (problems.length > 0) {
      console.log(`\nPRECONDICIONES ROTAS (no se escribe nada):\n- ${problems.join("\n- ")}`);
      console.log("PROD_WRITE_ROWS=0");
      process.exitCode = 1;
      return;
    }
    console.log(`\nPrecondiciones: OK · filas a cambiar: ${listingChanges.length + (saleChange ? 1 : 0)}`);
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const at = new Date().toISOString();
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [
        `# ${at} mercadolibre-reconcile-listings ANTES ${JSON.stringify({ listings: listingChanges, sale: saleChange })}`,
        ...rollback.map((statement) => `# ${at} mercadolibre-reconcile-listings DESHACER ${statement}`),
        "",
      ].join("\n"),
    );

    const now = new Date();
    const written = await db.$transaction(
      async (tx) => {
        let rows = 0;
        for (const change of listingChanges) {
          // Condicionado al estado leído: si cambió entre el ensayo y aquí, falla todo.
          const result = await tx.marketplaceListing.updateMany({
            where: { id: change.id, status: change.from },
            data: { status: change.to, lastRemoteUpdateAt: now },
          });
          if (result.count !== 1) throw new Error(`la publicación ${change.externalItemId} cambió de estado mientras corría; no se escribe nada`);
          rows += 1;
        }
        if (saleChange) {
          const result = await tx.marketplaceOrder.updateMany({
            where: { id: saleChange.id, status: "CANCELLED", inventoryStatus: "EXCEPTION", inventoryAppliedAt: null },
            data: { inventoryStatus: "NOT_APPLIED", inventoryError: null },
          });
          if (result.count !== 1) throw new Error(`la venta ${SALE_EXTERNAL_ID} cambió mientras corría; no se escribe nada`);
          rows += 1;
        }
        return rows;
      },
      { timeout: 30_000 },
    );
    console.log(`\nAplicado: ${written} filas.`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`mercadolibre-reconcile-listings: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
