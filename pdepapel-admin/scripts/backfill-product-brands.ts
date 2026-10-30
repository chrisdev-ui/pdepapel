/**
 * Marca para los productos sin marca (catálogo de Mercado Libre, 2026-10-30):
 * el texto viejo de marca o la única marca/línea/alias de la tienda que dice
 * el nombre (plan en `lib/brand-backfill-plan.ts`). No crea marcas ni pone
 * «Genérica»: eso se decide al publicar, por categoría.
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/backfill-product-brands.ts [--out output/plans/archivo.csv]
 * Escritura (con el token de Christian):
 *   npm run prod:approve -- "Marcas desde el nombre (Product.brandId, ProductGroup.brandId)"
 *   npm run prod:write -- scripts/backfill-product-brands.ts --apply --expect new
 *
 * Escribe con `assignBrandToProducts`, la misma regla del panel: un producto
 * de un grupo arrastra a su grupo y a todas sus variantes. Un grupo cuyas
 * variantes apuntan a marcas distintas no se toca. Antes de escribir anota
 * una línea DESHACER por producto en `ops/prod-writes.log`. Idempotente: solo
 * toca productos que siguen sin marca. La tienda muestra la marca al vencer
 * su caché.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { groupBackfillByBrand, planBrandBackfill } from "@/lib/brand-backfill-plan";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-product-brands.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const storeId = DEFAULT_STORE_ID;
    const [brands, products] = await Promise.all([
      db.brand.findMany({ where: { storeId, isArchived: false }, select: { id: true, name: true, aliases: true, parentBrandId: true } }),
      db.product.findMany({ where: { storeId, isArchived: false }, select: { id: true, sku: true, name: true, brand: true, brandId: true, productGroupId: true } }),
    ]);
    const plan = planBrandBackfill(products, brands);
    const { byBrand, conflictingGroups } = groupBackfillByBrand(plan);
    const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
    const withBrand = products.filter((product) => product.brandId).length;
    const toAssign = Array.from(byBrand.values()).reduce((sum, ids) => sum + ids.length, 0);
    const report = {
      modo: apply ? "APLICAR" : "ENSAYO",
      productos: products.length,
      conMarcaAntes: withBrand,
      sinMarca: plan.length,
      coincidencias: plan.filter((row) => row.status === "match").length,
      ambiguos: plan.filter((row) => row.status === "ambiguous").length,
      sinCoincidencia: plan.filter((row) => row.status === "none").length,
      gruposConMarcasDistintasSinTocar: conflictingGroups.length,
      productosAAsignar: toAssign,
      // En un grupo la marca es una sola: estas variantes la reciben aunque su nombre no la diga.
      variantesDelGrupoQueTambienCambian: (() => {
        const chosen = new Set(Array.from(byBrand.values()).flat());
        const groups = new Set(products.filter((product) => chosen.has(product.id) && product.productGroupId).map((product) => product.productGroupId));
        return products.filter((product) => product.productGroupId && groups.has(product.productGroupId) && !chosen.has(product.id)).length;
      })(),
      porMarca: Object.fromEntries(Array.from(byBrand.entries()).map(([id, ids]) => [brandName.get(id) ?? id, ids.length])),
    };
    console.log(JSON.stringify(report, null, 1));
    if (outFile) {
      const sku = new Map(products.map((product) => [product.id, product]));
      const lines = ["sku,nombre,estado,marca,fuente,candidatas"];
      for (const row of plan) {
        const product = sku.get(row.productId)!;
        const cells = [product.sku, product.name, row.status, row.status === "match" ? row.brandName : "", row.status === "match" ? row.source : "", row.status === "ambiguous" ? row.candidates.join(" / ") : ""];
        lines.push(cells.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","));
      }
      writeFileSync(outFile, lines.join("\n"));
    }
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const { assignBrandToProducts } = await import("@/lib/brands");
    const at = new Date().toISOString();
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [...Array.from(byBrand.values()).flat().map((id) => `# ${at} backfill-product-brands DESHACER UPDATE Product SET brandId = NULL WHERE id = '${id}';`), ""].join("\n"),
    );
    let written = 0;
    for (const [brandId, ids] of Array.from(byBrand.entries())) {
      const result = await assignBrandToProducts(storeId, brandId, ids, db as never);
      written += result.updatedProducts;
    }
    console.log(`\nAplicado: ${written} productos (incluye variantes de sus grupos).`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
