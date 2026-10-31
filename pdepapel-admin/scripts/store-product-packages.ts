/**
 * Guarda el paquete real (peso en gramos; alto, ancho y largo en cm) de los
 * productos que lista un archivo «SKU, peso, alto, ancho, largo» (ver
 * `parsePackageRows`). Requiere la migración 20261111.
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/store-product-packages.ts --file medidas.csv
 * Escritura (con el token de Christian):
 *   npm run prod:approve -- "Paquetes reales de la tanda (Product.package*)"
 *   npm run prod:write -- scripts/store-product-packages.ts --file medidas.csv --apply --expect new
 *
 * Antes de escribir anota una línea DESHACER por producto (con las medidas que
 * tenía) en `ops/prod-writes.log`. Idempotente: un producto que ya tiene esas
 * medidas no se toca.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { parsePackageRows } from "@/lib/product-package";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const sqlValue = (value: number | null) => (value === null ? "NULL" : String(value));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileIndex = args.indexOf("--file");
  const file = fileIndex >= 0 ? args[fileIndex + 1] : null;
  if (!file) throw new Error("falta --file con las filas «SKU, peso g, alto, ancho, largo cm».");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/store-product-packages.ts --file … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { rows, problems } = parsePackageRows(readFileSync(resolve(process.cwd(), file), "utf8"));
  if (problems.length) throw new Error(`el archivo tiene errores; no se escribió nada:\n${problems.join("\n")}`);

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const products = await db.product.findMany({
      where: { storeId: DEFAULT_STORE_ID, sku: { in: rows.map((row) => row.sku) } },
      select: { id: true, sku: true, name: true, packageWeightGrams: true, packageHeightCm: true, packageWidthCm: true, packageLengthCm: true },
    });
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const missing = rows.filter((row) => !bySku.has(row.sku)).map((row) => row.sku);
    if (missing.length) throw new Error(`SKU que no existen en la tienda; no se escribió nada: ${missing.join(", ")}`);

    const changes = rows.flatMap((row) => {
      const before = bySku.get(row.sku)!;
      const same =
        before.packageWeightGrams === row.weightGrams &&
        before.packageHeightCm === row.heightCm &&
        before.packageWidthCm === row.widthCm &&
        before.packageLengthCm === row.lengthCm;
      return same ? [] : [{ row, before }];
    });
    console.log(
      JSON.stringify(
        {
          modo: apply ? "APLICAR" : "ENSAYO",
          filas: rows.length,
          sinCambio: rows.length - changes.length,
          aCambiar: changes.map(({ row, before }) => ({
            sku: row.sku,
            antes: before.packageWeightGrams === null ? "sin medir" : `${before.packageWeightGrams} g ${before.packageHeightCm}x${before.packageWidthCm}x${before.packageLengthCm}`,
            despues: `${row.weightGrams} g ${row.heightCm}x${row.widthCm}x${row.lengthCm}`,
          })),
        },
        null,
        1,
      ),
    );
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const at = new Date().toISOString();
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [
        ...changes.map(
          ({ before }) =>
            `# ${at} store-product-packages DESHACER UPDATE Product SET packageWeightGrams = ${sqlValue(before.packageWeightGrams)}, packageHeightCm = ${sqlValue(before.packageHeightCm)}, packageWidthCm = ${sqlValue(before.packageWidthCm)}, packageLengthCm = ${sqlValue(before.packageLengthCm)} WHERE id = '${before.id}';`,
        ),
        "",
      ].join("\n"),
    );
    let written = 0;
    for (const { row, before } of changes) {
      await db.product.update({
        where: { id: before.id },
        data: { packageWeightGrams: row.weightGrams, packageHeightCm: row.heightCm, packageWidthCm: row.widthCm, packageLengthCm: row.lengthCm },
      });
      written += 1;
    }
    console.log(`\nAplicado: ${written} productos.`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
