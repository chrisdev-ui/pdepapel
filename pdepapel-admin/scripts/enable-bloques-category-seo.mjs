/**
 * Vuelve indexable la categoría «Bloques de construcción» (antes «Lego»):
 * `Category.seoEnabled` false → true en esa sola fila. Con eso la ficha deja
 * de ser noindex y entra al sitemap (`app/sitemap.ts` de la tienda lista las
 * categorías con seoEnabled y slug). Va después de renombrarla
 * (scripts/rename-lego-to-bloques.mjs) y de comprobar con curl que
 * /categoria/bloques-de-construccion da 200 con los textos aprobados y que
 * /categoria/lego redirige (308) a ella.
 *
 *   node --env-file=.env scripts/enable-bloques-category-seo.mjs [--dry-run]
 *       Solo lectura (pdepapel_ro): comprueba la categoría, sus textos, el
 *       alias `lego` y que tenga productos vivos; guarda la copia del valor
 *       actual en ~/pdepapel-backups/<fecha>/ y muestra el cambio.
 *   npm run prod:write -- scripts/enable-bloques-category-seo.mjs --apply <copia.json>
 *   npm run prod:write -- scripts/enable-bloques-category-seo.mjs --revert <copia.json>
 *       Escritura con aprobación fresca. Una transacción; tiene que cambiar
 *       exactamente 1 fila y solo si nombre, slug y textos siguen como en la
 *       copia. Si no, no se escribe nada.
 *
 * La tienda lo ve en 5–11 minutos (ISR 300 s y caché de la API).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const CATEGORY_ID = "a8729e87-34ae-494d-944b-b3a09bab3a42";
const EXPECTED = { name: "Bloques de construcción", slug: "bloques-de-construccion", isArchived: false };
const LEGO = /(^|[^\p{L}\p{N}])lego/iu;

const [mode = "--dry-run", backupArg] = process.argv.slice(2);
if (!["--dry-run", "--apply", "--revert"].includes(mode)) throw new Error("uso: [--dry-run] | --apply <copia.json> | --revert <copia.json>");
if (mode !== "--dry-run" && !backupArg) throw new Error(`${mode} necesita la copia de respaldo del ensayo`);

let db;
if (mode === "--dry-run") {
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
} else {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
}

const SELECT = { id: true, storeId: true, name: true, slug: true, isArchived: true, seoEnabled: true, seoTitle: true, seoDescription: true, seoIntro: true };

try {
  const current = await db.category.findFirst({ where: { id: CATEGORY_ID, storeId: STORE_ID }, select: SELECT });
  if (!current) throw new Error("no existe la categoría");

  if (mode === "--dry-run") {
    const problems = [];
    for (const [field, value] of Object.entries(EXPECTED)) if (current[field] !== value) problems.push(`${field} es ${JSON.stringify(current[field])}`);
    if (current.seoEnabled !== false) problems.push("seoEnabled ya es true");
    for (const field of ["seoTitle", "seoDescription", "seoIntro"]) if (!current[field]?.trim()) problems.push(`${field} vacío`);
    for (const field of ["name", "slug", "seoTitle", "seoDescription"]) if (current[field] && LEGO.test(current[field])) problems.push(`${field} menciona Lego`);
    const [alias, liveProducts] = await Promise.all([
      db.categorySlugAlias.findFirst({ where: { storeId: STORE_ID, slug: "lego" }, select: { categoryId: true } }),
      db.product.count({ where: { storeId: STORE_ID, categoryId: CATEGORY_ID, isArchived: false } }),
    ]);
    if (alias?.categoryId !== CATEGORY_ID) problems.push("falta el alias lego → esta categoría");
    if (liveProducts === 0) problems.push("la categoría no tiene productos vivos");
    if (problems.length) throw new Error(`no se prepara nada: ${problems.join("; ")}`);

    const takenAt = new Date().toISOString();
    const dir = join(homedir(), "pdepapel-backups", takenAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const backupPath = join(dir, `enable-bloques-category-seo-${takenAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(backupPath, JSON.stringify({ takenAt, ...current }, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ mode, id: current.id, name: current.name, slug: current.slug, liveProducts, aliasLego: "ok", seoEnabled: "false → true", backup: backupPath }, null, 1));
  } else {
    const backup = JSON.parse(readFileSync(backupArg, "utf8"));
    if (backup.storeId !== STORE_ID || backup.id !== CATEGORY_ID) throw new Error("la copia no corresponde a esta categoría");
    const [expected, next] = mode === "--apply" ? [false, true] : [true, false];

    const updated = await db.$transaction(
      async (tx) => {
        const result = await tx.category.updateMany({
          where: {
            id: CATEGORY_ID,
            storeId: STORE_ID,
            name: backup.name,
            slug: backup.slug,
            isArchived: false,
            seoTitle: backup.seoTitle,
            seoDescription: backup.seoDescription,
            seoIntro: backup.seoIntro,
            seoEnabled: expected,
          },
          data: { seoEnabled: next },
        });
        if (result.count !== 1) throw new Error(`se esperaba 1 fila con seoEnabled=${expected} y los textos de la copia, se actualizaron ${result.count}. No se escribió nada.`);
        return result.count;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    const after = await db.category.findFirst({ where: { id: CATEGORY_ID }, select: { slug: true, seoEnabled: true } });
    console.log(`PROD_WRITE_ROWS=${updated}`);
    console.log(JSON.stringify({ mode, updated, ...after }, null, 1));
  }
} finally {
  await db.$disconnect();
}
