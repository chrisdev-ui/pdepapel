/**
 * Crea el banner de preventa de la portada (Banner de campaña › Preventa) por
 * el mismo camino que «Crear» en Contenido › Portada: `parseHomeContentBody`
 * valida y `homeContentDataFromInput` arma la fila, con su producto en
 * HomeContentProduct. Sin imagen: la tienda usa la foto del producto. No llama
 * a la revalidación de la tienda (desde la máquina local no tiene el secreto);
 * la portada vuelve a pedir el contenido en ≤ 5 min.
 *
 * Ensayo (no escribe; corre con pdepapel_ro y muestra lo que devolvería `?live=1`):
 *   npm run prod:write -- --dry-run scripts/home-content-presale-campaign.ts --product <id> --title "<título>" --eyebrow "<etiqueta>" --promotion <id-ga4> --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- scripts/home-content-presale-campaign.ts --product <id> --title "<título>" --eyebrow "<etiqueta>" --promotion <id-ga4> --apply --expect new
 *
 * Se niega si ya hay un contenido con ese identificador de GA4, si el producto
 * no es de la tienda, está archivado o no tiene una preventa activa con cupo.
 *
 * prod-write-models: HomeContent, HomeContentProduct
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { HOME_CONTENT_ADMIN_SELECT, homeContentDataFromInput, liveHomeContentWhere, parseHomeContentBody, selectLiveHomeContent } from "@/lib/home-content";
import { loadPresaleOffers } from "@/lib/home-content-presale";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

const argValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const bogotaToday = (now: Date) => new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function main() {
  const args = process.argv.slice(2);
  const productId = argValue(args, "--product");
  const title = argValue(args, "--title")?.trim();
  const eyebrow = argValue(args, "--eyebrow")?.trim();
  const promotionId = argValue(args, "--promotion")?.trim();
  const storeId = argValue(args, "--store") ?? DEFAULT_STORE_ID;
  const apply = args.includes("--apply");
  if (!productId || !title || !eyebrow || !promotionId) throw new Error("faltan --product, --title, --eyebrow o --promotion.");

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/home-content-presale-campaign.ts … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const now = new Date();
  const input = parseHomeContentBody({
    placement: "CAMPAIGN",
    campaignType: "PRESALE",
    eyebrow,
    title,
    primaryLabel: "Separar el mío",
    primaryUrl: "",
    promotionId,
    productIds: [productId],
    isActive: true,
    startsAt: bogotaToday(now),
  });
  const data = homeContentDataFromInput(input);

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const [product, duplicate, liveBefore] = await Promise.all([
      db.product.findFirst({ where: { id: productId, storeId }, select: { id: true, name: true, slug: true, isArchived: true } }),
      db.homeContent.findFirst({ where: { storeId, promotionId }, select: { id: true, title: true } }),
      db.homeContent.findMany({ where: liveHomeContentWhere(storeId, now), select: HOME_CONTENT_ADMIN_SELECT }),
    ]);
    const problems = [
      !product ? "el producto no es de esta tienda" : null,
      product?.isArchived ? "el producto está archivado" : null,
      duplicate ? `ya existe el contenido «${duplicate.title}» con el identificador ${promotionId}` : null,
    ].filter(Boolean);

    const fila = { ...data, products: [{ productId, position: 0 }] };
    console.log(JSON.stringify({ fila, enVivoAntes: liveBefore.map((entry) => ({ placement: entry.placement, campaignType: entry.campaignType, title: entry.title })), bloqueos: problems }, null, 1));
    if (problems.length) throw new Error(`no se crea: ${problems.join("; ")}.`);

    if (!apply) {
      const preview = { ...fila, id: "(nuevo)", storeId, createdAt: now, updatedAt: now, earlyAccessSentAt: null, arrivalSentAt: null, products: [] } as unknown as (typeof liveBefore)[number];
      const productRow = await db.product.findUniqueOrThrow({ where: { id: productId }, select: HOME_CONTENT_ADMIN_SELECT.products.select.product.select });
      (preview as unknown as { products: unknown[] }).products = [{ position: 0, product: productRow }];
      const entries = [...liveBefore, preview];
      const offerFor = await loadPresaleOffers(storeId, entries, now);
      const { campaign } = selectLiveHomeContent(entries, now, offerFor);
      if (!campaign || campaign.id !== "(nuevo)") throw new Error("el banner no saldría en vivo: la preventa no está activa o está llena.");
      console.log("Ensayo: ?live=1 devolvería", JSON.stringify(campaign, null, 1));
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const entry = await db.homeContent.create({
      data: { ...data, storeId, products: { create: [{ productId, position: 0 }] } },
      select: { id: true },
    });
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} home-content-presale-campaign «${title}» (${promotionId}) · contenido ${entry.id} · DESHACER desde Contenido › Portada (Publicada apagado o Eliminar).\n`,
    );
    console.log(`Creado: contenido ${entry.id} («${title}», ${promotionId}).`);
    console.log("PROD_WRITE_ROWS=2");
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
