/**
 * Marcas en Mercado Libre (feat/marcas, 2026-10-17). SOLO LECTURA: compara el
 * atributo BRAND de cada publicación activa con la marca que hoy mandaría el
 * panel (`mercadoLibreBrandName`: la marca enlazada y, mientras no esté
 * verificada la migración, el texto anterior). No escribe nada en la base ni
 * en Mercado Libre: la marca solo viaja en las publicaciones que se crean o
 * editan desde el panel, nunca en una actualización masiva.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/mercadolibre-brand-audit.ts
 *
 * Imprime ids de publicación y conteos, nada más. El token de Mercado Libre
 * NUNCA se renueva desde aquí (el refresh token es de un solo uso): si vence
 * en menos de cinco minutos, el guion se detiene y hay que esperar a que
 * producción lo renueve.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { brandKey } from "@/lib/brand-rules";
import { MERCADOLIBRE_BRAND_SELECT, mercadoLibreBrandName } from "@/lib/mercadolibre/brand";
import { decryptMercadoLibreToken } from "@/lib/mercadolibre/crypto";

import { assertReadOnlyUser } from "./lib/read-only-user";

const PRODUCTION_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const BATCH = 20;
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

function encryptionKey(): string {
  const fromEnv = process.env.MERCADOLIBRE_TOKEN_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;
  const line = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("MERCADOLIBRE_TOKEN_ENCRYPTION_KEY="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("falta MERCADOLIBRE_TOKEN_ENCRYPTION_KEY en .env");
  return value;
}

type RemoteBrand = { brand: string | null } | { error: string };

async function readRemoteBrands(accessToken: string, ids: string[]): Promise<Map<string, RemoteBrand>> {
  const result = new Map<string, RemoteBrand>();
  for (let index = 0; index < ids.length; index += BATCH) {
    const batch = ids.slice(index, index + BATCH);
    const url = `https://api.mercadolibre.com/items?ids=${batch.map(encodeURIComponent).join(",")}&attributes=id,attributes`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Mercado Libre respondió ${response.status} al leer ${batch.length} publicaciones`);
    const payload = (await response.json()) as {
      code: number;
      body: { id?: string; attributes?: { id: string; value_name: string | null }[]; message?: string };
    }[];
    batch.forEach((id, position) => {
      const entry = payload.find((item) => item.body?.id === id) ?? payload[position];
      if (!entry || entry.code !== 200 || !entry.body) {
        result.set(id, { error: `código ${entry?.code ?? "?"}` });
        return;
      }
      const brand = entry.body.attributes?.find((attribute) => attribute.id === "BRAND")?.value_name?.trim() || null;
      result.set(id, { brand });
    });
  }
  return result;
}

async function main() {
  if (process.env.PROD_WRITE_APPROVED === "1") throw new Error("Este guion es solo de lectura: córrelo con --env-file=.env, no con prod:write.");
  const db = new PrismaClient();
  try {
    await assertReadOnlyUser(db);
    const connection = await db.marketplaceConnection.findUniqueOrThrow({
      where: { storeId_provider: { storeId: PRODUCTION_STORE_ID, provider: "MERCADOLIBRE" } },
      select: { id: true, status: true, encryptedAccessToken: true, accessTokenExpiresAt: true },
    });
    if (!connection.encryptedAccessToken || !connection.accessTokenExpiresAt) throw new Error("la conexión no tiene token de acceso");
    if (connection.accessTokenExpiresAt.getTime() <= Date.now() + TOKEN_MARGIN_MS) {
      console.log("El token de acceso vence en menos de 5 min: no se renueva desde aquí. Espera a que producción lo renueve y vuelve a correr.");
      process.exitCode = 2;
      return;
    }
    const accessToken = decryptMercadoLibreToken(connection.encryptedAccessToken, encryptionKey());

    const listings = await db.marketplaceListing.findMany({
      where: { connectionId: connection.id, status: "ACTIVE", externalItemId: { not: null } },
      select: { externalItemId: true, product: { select: MERCADOLIBRE_BRAND_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    const remote = await readRemoteBrands(accessToken, listings.map((listing) => listing.externalItemId!));

    const missing: string[] = [];
    const different: string[] = [];
    const unknownLocally: string[] = [];
    const unreadable: string[] = [];
    let same = 0;
    for (const listing of listings) {
      const id = listing.externalItemId!;
      const item = remote.get(id);
      if (!item || "error" in item) {
        unreadable.push(id);
        continue;
      }
      const expected = mercadoLibreBrandName(listing.product);
      if (!item.brand) missing.push(id);
      else if (!expected) unknownLocally.push(id);
      else if (brandKey(item.brand) !== brandKey(expected)) different.push(id);
      else same += 1;
    }

    console.log(`Publicaciones activas leídas: ${listings.length}`);
    console.log(`  BRAND igual a la marca del panel: ${same}`);
    console.log(`  Sin BRAND en Mercado Libre: ${missing.length}${missing.length ? ` → ${missing.join(", ")}` : ""}`);
    console.log(`  BRAND distinto de la marca del panel: ${different.length}${different.length ? ` → ${different.join(", ")}` : ""}`);
    console.log(`  Con BRAND en Mercado Libre pero sin marca en el panel: ${unknownLocally.length}${unknownLocally.length ? ` → ${unknownLocally.join(", ")}` : ""}`);
    console.log(`  No se pudieron leer: ${unreadable.length}${unreadable.length ? ` → ${unreadable.join(", ")}` : ""}`);
    console.log("Nada se escribió. La marca solo se manda al crear o editar cada publicación desde el panel.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "error");
  process.exit(1);
});
