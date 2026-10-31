/**
 * Publicador por tandas de Mercado Libre (B2). Lee un plan de tanda (precios
 * aprobados, categoría, paquete y fotos del paquete aprobadas en la hoja de
 * contacto) y, por cada producto, arma el borrador y el cuerpo exacto que
 * recibiría Mercado Libre (`buildMercadoLibreItemPayload`).
 *
 * Ensayo (por defecto; no escribe nada; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/mercadolibre-publish-wave.ts --plan ../output/audits/mercadolibre-ola1-plan.json [--out archivo.json]
 *
 * Publicación real (Christian): solo con el interruptor de escrituras apagado,
 * la bandera de la tanda y la hoja de contacto aprobada. Crea un borrador por
 * producto y encola PUBLISH_LISTING; el trabajador de la cola vuelve a revisar
 * el interruptor y la preventa antes de llamar a Mercado Libre.
 *   npm run prod:approve -- "Tanda ola-1 de Mercado Libre (MarketplaceListing + PUBLISH_LISTING)"
 *   npm run prod:write -- scripts/mercadolibre-publish-wave.ts --plan … --publish --approve-wave=ola-1 --expect new
 * Nunca publica una preventa: se excluye aquí y otra vez en el trabajador.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { MarketplaceListingStatus, MarketplaceProvider, PrismaClient } from "@prisma/client";

import { MERCADOLIBRE_BRAND_SELECT } from "@/lib/mercadolibre/brand";
import { findLicensedCharacter } from "@/lib/mercadolibre/licensed-characters";
import { buildMercadoLibreItemPayload } from "@/lib/mercadolibre/listings";
import { loadMercadoLibrePresaleBlocked, loadMercadoLibreSellable } from "@/lib/mercadolibre/available-quantity";
import { type WavePlan, type WaveProduct, isHeldWaveItem, planWaveItem, wavePublishBlockers, wavePublishItems } from "@/lib/mercadolibre/wave-publisher";
import { areMercadoLibreWritesPausedForStore } from "@/lib/mercadolibre/writes-switch";
import { GALLERY_ORDER } from "@/lib/variant-gallery";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

const argValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

async function productColumnsExist(db: PrismaClient, columns: string[]) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Product' AND COLUMN_NAME IN (${columns.map(() => "?").join(",")})`,
    ...columns,
  );
  return rows.length === columns.length;
}

async function main() {
  const args = process.argv.slice(2);
  const planPath = argValue(args, "--plan");
  if (!planPath) throw new Error("falta --plan con el plan de la tanda.");
  const outPath = argValue(args, "--out");
  const publish = args.includes("--publish");
  const approveWave = argValue(args, "--approve-wave");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (publish && !viaProdWrite) throw new Error("--publish solo corre con `npm run prod:write -- scripts/mercadolibre-publish-wave.ts … --publish --approve-wave=<tanda> --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const plan = JSON.parse(readFileSync(resolve(process.cwd(), planPath), "utf8")) as WavePlan;
  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const storeId = DEFAULT_STORE_ID;
    const connection = await db.marketplaceConnection.findFirst({
      where: { storeId, provider: MarketplaceProvider.MERCADOLIBRE },
      select: { id: true, status: true, recoveryScheduleId: true },
    });
    if (!connection) throw new Error("la tienda no tiene conexión de Mercado Libre.");

    // Antes de la migración 20261111 no existen el paquete medido ni la aprobación de licencia.
    const withPackage = await productColumnsExist(db, ["packageWeightGrams", "packageHeightCm", "packageWidthCm", "packageLengthCm"]);
    const withLicenseApproval = await productColumnsExist(db, ["mercadoLibreLicenseApprovedAt"]);
    const products = await db.product.findMany({
      where: { storeId, sku: { in: plan.items.map((item) => item.sku) } },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        stock: true,
        reservedUnits: true,
        isArchived: true,
        gtin: true,
        mpn: true,
        hasNoProductIdentifier: true,
        acqPrice: true,
        transportationCost: true,
        ...MERCADOLIBRE_BRAND_SELECT,
        productGroup: { select: { ...MERCADOLIBRE_BRAND_SELECT.productGroup.select, name: true } },
        images: { select: { url: true, isMain: true }, orderBy: GALLERY_ORDER },
        ...(withPackage ? { packageWeightGrams: true, packageHeightCm: true, packageWidthCm: true, packageLengthCm: true } : {}),
        ...(withLicenseApproval ? { mercadoLibreLicenseApprovedAt: true } : {}),
      },
    });
    const ids = products.map((product) => product.id);
    const blocked = await loadMercadoLibrePresaleBlocked(db, ids);
    const sellable = await loadMercadoLibreSellable(db, ids, blocked);
    const listed = new Set(
      (await db.marketplaceListing.findMany({ where: { connectionId: connection.id, productId: { in: ids } }, select: { productId: true } })).map((row) => row.productId),
    );

    const planned = plan.items.map((item) => {
      const product = products.find((row) => row.sku === item.sku) ?? null;
      if (!product) return planWaveItem(item, null, null, connection.id);
      const record = product as typeof product & { mercadoLibreLicenseApprovedAt?: Date | null };
      return planWaveItem(item, product as unknown as WaveProduct, {
        sellable: sellable.get(product.id) ?? 0,
        presaleBlocked: blocked.has(product.id),
        licensed: findLicensedCharacter(product.name, [item.title, product.productGroup?.name, item.brandName ?? product.brandRef?.name ?? product.brand]),
        licenseApproved: Boolean(record.mercadoLibreLicenseApprovedAt),
        alreadyListed: listed.has(product.id),
      }, connection.id);
    });

    const report = planned.map((item) => {
      let payload: unknown = null;
      let payloadError: string | null = null;
      if (item.draft) {
        try {
          payload = buildMercadoLibreItemPayload(item.draft);
        } catch (error) {
          payloadError = error instanceof Error ? error.message : String(error);
        }
      }
      return {
        rank: item.rank,
        sku: item.sku,
        publishable: item.publishable && !payloadError,
        reasons: payloadError ? [...item.reasons, payloadError] : item.reasons,
        warnings: item.warnings,
        packageSource: item.packageSource,
        payload,
      };
    });
    const writesPaused = await areMercadoLibreWritesPausedForStore(storeId);
    const blockers = wavePublishBlockers({ writesPaused, approveWaveFlag: approveWave, plan, items: planned });

    const summary = {
      modo: publish ? "PUBLICAR" : "ENSAYO",
      tanda: plan.waveId,
      conexion: connection.status,
      escriturasEnPausa: writesPaused,
      columnasMigracion20261111: withPackage && withLicenseApproval,
      publicables: report.filter((row) => row.publishable).length,
      retenidos: planned.filter(isHeldWaveItem).map((item) => `#${item.rank} ${item.sku}`),
      total: report.length,
      bloqueosDePublicacion: blockers,
    };
    console.log(JSON.stringify(summary, null, 1));
    for (const row of report) {
      const body = row.payload as { price?: number; listing_type_id?: string; available_quantity?: number; pictures?: unknown[]; shipping?: { dimensions?: string } } | null;
      console.log(
        `#${row.rank} ${row.sku} | ${row.publishable ? "lista" : "fuera"} | ${body ? `${body.price} ${body.listing_type_id} stock ${body.available_quantity} fotos ${body.pictures?.length} paquete ${body.shipping?.dimensions} (${row.packageSource})` : "sin cuerpo"}${row.reasons.length ? ` | motivos: ${row.reasons.join(" ")}` : ""}${row.warnings.length ? ` | avisos: ${row.warnings.join(" ")}` : ""}`,
      );
    }
    if (outPath) writeFileSync(resolve(process.cwd(), outPath), JSON.stringify({ summary, items: report }, null, 1));

    if (!publish) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (blockers.length) throw new Error(`no se publicó nada:\n${blockers.join("\n")}`);
    if (!connection.recoveryScheduleId) throw new Error("no se publicó nada: falta el procesamiento seguro de Mercado Libre (QStash).");

    const { enqueuePendingMarketplaceOutboxEventsForStore, queueMarketplaceListingPublicationEvent } = await import("@/lib/mercadolibre/outbox");
    const at = new Date().toISOString();
    let written = 0;
    const held = planned.filter(isHeldWaveItem);
    if (held.length) console.log(`Retenidos (no se publican en esta corrida): ${held.map((item) => `#${item.rank} ${item.sku}`).join(", ")}`);
    for (const item of wavePublishItems(planned)) {
      const draft = item.draft!;
      const listing = await db.marketplaceListing.create({
        data: {
          connectionId: connection.id,
          productId: draft.product.id,
          status: MarketplaceListingStatus.DRAFT,
          categoryId: draft.categoryId,
          listingType: draft.listingType,
          marketplacePrice: draft.marketplacePrice,
          stockSafetyBuffer: draft.stockSafetyBuffer,
          syncStock: true,
          metadata: item.metadata ?? undefined,
        },
        select: { id: true },
      });
      appendFileSync(resolve(process.cwd(), "ops/prod-writes.log"), `# ${at} mercadolibre-publish-wave ${plan.waveId} DESHACER (si no salió) DELETE FROM MarketplaceListing WHERE id = '${listing.id}' AND externalItemId IS NULL;\n`);
      await queueMarketplaceListingPublicationEvent(db, { connectionId: connection.id, listingId: listing.id, productId: draft.product.id });
      written += 1;
    }
    await enqueuePendingMarketplaceOutboxEventsForStore(storeId);
    console.log(`\nEncolado: ${written} publicaciones de la tanda ${plan.waveId}.`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
