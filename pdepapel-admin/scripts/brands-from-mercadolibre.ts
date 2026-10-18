/**
 * Marcas desde el BRAND de Mercado Libre (feat/marcas). Regla en
 * `lib/brand-mercadolibre-mapping.ts`. La decisión por cada valor de BRAND vive
 * en un JSON local sin rastrear, por defecto `tmp/brands-mercadolibre.json`.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/brands-from-mercadolibre.ts [--config tmp/brands-mercadolibre.json]
 *       ENSAYO con el usuario de lectura: lee el BRAND de cada publicación
 *       activa (GET, nunca renueva el token), calcula el plan y lo guarda con
 *       sus entradas (ids de publicación y producto, valor de BRAND) en
 *       output/audits/. No escribe.
 *   npm run prod:write -- scripts/brands-from-mercadolibre.ts --apply --plan "<plan.json>" --expect-rows N --expect new
 *       En una transacción comprueba que cada publicación siga activa y con
 *       el mismo producto, vuelve a calcular el plan con las entradas guardadas
 *       y escribe solo si es idéntico y suma N. No llama a Mercado Libre.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import type { BrandInitialPlan } from "../lib/brand-initial-data";
import {
  applyMercadoLibreBrandPlan,
  loadMercadoLibreBrandPlan,
  VIA_GROUP,
  type MercadoLibreBrandConfig,
  type MercadoLibreBrandListing,
} from "../lib/brand-mercadolibre-mapping";
import { decryptMercadoLibreToken } from "../lib/mercadolibre/crypto";
import { assertReadOnlyUser } from "./lib/read-only-user";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const expectRows = valueOf("--expect-rows") === undefined ? undefined : Number(valueOf("--expect-rows"));
const planPath = valueOf("--plan");
const configPath = path.resolve(process.cwd(), valueOf("--config") ?? "tmp/brands-mercadolibre.json");
const BATCH = 20;
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

interface SavedPlan {
  inputs: { listings: MercadoLibreBrandListing[] };
  plan: BrandInitialPlan;
}

async function client(): Promise<PrismaClient> {
  if (process.env.PROD_WRITE_APPROVED === "1") {
    if (process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");
    const { createProdClient } = (await import("./lib/prod-client.mjs")) as unknown as { createProdClient: () => PrismaClient };
    return createProdClient();
  }
  if (apply) throw new Error('--apply solo corre con `npm run prod:write -- scripts/brands-from-mercadolibre.ts --apply --plan "<plan.json>" --expect-rows N --expect new`.');
  return new PrismaClient();
}

function encryptionKey(): string {
  const fromEnv = process.env.MERCADOLIBRE_TOKEN_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;
  const line = readFileSync(path.resolve(process.cwd(), ".env"), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("MERCADOLIBRE_TOKEN_ENCRYPTION_KEY="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("falta MERCADOLIBRE_TOKEN_ENCRYPTION_KEY en .env");
  return value;
}

async function readListings(db: PrismaClient, storeId: string): Promise<MercadoLibreBrandListing[] | null> {
  const connection = await db.marketplaceConnection.findUniqueOrThrow({
    where: { storeId_provider: { storeId, provider: "MERCADOLIBRE" } },
    select: { id: true, encryptedAccessToken: true, accessTokenExpiresAt: true },
  });
  if (!connection.encryptedAccessToken || !connection.accessTokenExpiresAt) throw new Error("la conexión no tiene token de acceso");
  if (connection.accessTokenExpiresAt.getTime() <= Date.now() + TOKEN_MARGIN_MS) return null;
  const accessToken = decryptMercadoLibreToken(connection.encryptedAccessToken, encryptionKey());
  const rows = await db.marketplaceListing.findMany({
    where: { connectionId: connection.id, status: "ACTIVE", externalItemId: { not: null } },
    select: { externalItemId: true, productId: true },
  });
  const listings: MercadoLibreBrandListing[] = [];
  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);
    const url = `https://api.mercadolibre.com/items?ids=${batch.map((row) => encodeURIComponent(row.externalItemId!)).join(",")}&attributes=id,attributes`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Mercado Libre respondió ${response.status} al leer ${batch.length} publicaciones`);
    const payload = (await response.json()) as { code: number; body: { id?: string; attributes?: { id: string; value_name: string | null }[] } }[];
    for (const row of batch) {
      const entry = payload.find((item) => item.body?.id === row.externalItemId);
      if (!entry || entry.code !== 200) throw new Error(`no se pudo leer ${row.externalItemId}: vuelve a correr el ensayo`);
      const mlBrand = entry.body.attributes?.find((attribute) => attribute.id === "BRAND")?.value_name?.trim();
      if (mlBrand) listings.push({ externalItemId: row.externalItemId!, productId: row.productId, mlBrand });
    }
  }
  return listings.sort((a, b) => a.externalItemId.localeCompare(b.externalItemId));
}

function record(name: string, data: unknown) {
  const dir = path.resolve(process.cwd(), "../output/audits");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `marcas-ml-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function summary(plan: BrandInitialPlan) {
  const byBrand = new Map<string, number>();
  for (const row of plan.productAssignments) byBrand.set(row.brand, (byBrand.get(row.brand) ?? 0) + 1);
  const reasons = new Map<string, number>();
  for (const row of plan.manualReview) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  return {
    marcasACrear: plan.createBrands.map((brand) => `${brand.name}${brand.isVisible ? "" : " [oculta]"}`),
    gruposAAsignar: plan.groupAssignments.length,
    productosAAsignar: plan.productAssignments.length,
    productosDePublicaciones: plan.productAssignments.filter((row) => row.via !== VIA_GROUP).length,
    variantesPorSuGrupo: plan.productAssignments.filter((row) => row.via === VIA_GROUP).length,
    productosPorMarca: Object.fromEntries(byBrand),
    revisionManual: plan.manualReview.length,
    motivosRevision: Object.fromEntries(reasons),
    filas: plan.rows,
  };
}

async function main() {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as MercadoLibreBrandConfig;
  const db = await client();
  try {
    if (!apply) {
      if (process.env.PROD_WRITE_APPROVED !== "1") await assertReadOnlyUser(db);
      const listings = await readListings(db, config.storeId);
      if (!listings) {
        console.log("El token de acceso vence en menos de 5 min: no se renueva desde aquí. Espera a que producción lo renueve y vuelve a correr.");
        process.exitCode = 2;
        return;
      }
      const plan = await loadMercadoLibreBrandPlan(db, config, listings);
      console.log(`publicaciones activas con BRAND: ${listings.length}`);
      console.log(JSON.stringify(summary(plan), null, 2));
      const file = record("plan", { inputs: { listings }, plan } satisfies SavedPlan);
      console.log(`plan: ${file}`);
      console.log(`Ensayo: se escribirían ${plan.rows} filas. Para aplicar: --apply --plan "${file}" --expect-rows ${plan.rows}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (!planPath) throw new Error("falta --plan <plan.json> (el que guardó el ensayo); no se escribe nada.");
    if (expectRows === undefined || Number.isNaN(expectRows)) throw new Error("falta --expect-rows N (el N del ensayo); no se escribe nada.");
    const saved = JSON.parse(readFileSync(planPath, "utf8")) as SavedPlan;
    const result = await db.$transaction(
      (tx) => applyMercadoLibreBrandPlan(tx, config, saved.inputs.listings, saved.plan, expectRows, "script:brands-from-mercadolibre"),
      { timeout: 60_000, maxWait: 10_000 },
    );
    console.log(`marcas creadas: ${result.brandsCreated} · grupos: ${result.groupsWritten} · productos: ${result.productsWritten}`);
    console.log(`registro: ${record("aplicado", saved)}`);
    console.log(`PROD_WRITE_ROWS=${result.written}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
