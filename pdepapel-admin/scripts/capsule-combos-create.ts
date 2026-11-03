/**
 * «Cápsula sorpresa» para lives, WhatsApp y la tienda (2026-11-03): Paula arma las cápsulas a mano con un papelito
 * adentro y las vende solo en combos (mínimo 5), a los precios de su banner. El inventario de los premios se descuenta
 * al abrir cada cápsula («Salió en cápsula · ORD-…:SKU»), no aquí.
 *
 * Un producto por combo (x5, x6, x7, x8, x9, x10, x12, x15), en «Kits sorpresa». No hay una «cápsula suelta» vendible:
 * un kit no puede llevar un componente archivado (assertValidKitComponents) y el catálogo no restringe cantidades,
 * así que cada combo es su propio producto con su precio. Se crea por los mismos pasos que el panel:
 * - SKU con generateSemanticSKU y slug con getUniqueProductSlug;
 * - «sin identificador de producto» (no tiene GTIN);
 * - el stock entra con un INITIAL_INTAKE (createInventoryMovement), nunca escribiendo la columna.
 * El stock es de combos: 300 cápsulas provisionales ÷ N. Paula lo ajusta cuando arma más.
 *
 * Costo provisional = N × costo promedio real por cápsula de Villaterra (53 cápsulas, todas con costo: $5.107).
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-combos-create.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-combos-create.ts --apply --expect new
 *
 * Reanudable: un combo que ya existe con el mismo nombre en la tienda se salta.
 *
 * prod-write-models: Product, InventoryMovement
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const CATEGORY = "Kits sorpresa";
const DESIGN = "Sorpresa";
const COLOR = "Multicolor";
const SIZE = "S";
const COST_PER_CAPSULE = 5_107;
const PROVISIONAL_CAPSULES = 300;
/**
 * «Próximamente» hasta que salgan la exclusión de «Kits sorpresa» de los feeds (Google Merchant y Meta) y el aviso de
 * la tienda que cuenta las cápsulas del combo: los feeds y el checkout web saltan un producto con `availableAt` futuro;
 * los pedidos del panel, el pago y la guía no miran esa fecha. Después se quita la fecha.
 */
const AVAILABLE_AT = new Date("2027-01-01T05:00:00.000Z");

/** [cápsulas, precio del combo] — banner de Paula, 2026-11-03. */
const COMBOS: [number, number][] = [
  [5, 40_000],
  [6, 45_000],
  [7, 49_000],
  [8, 54_000],
  [9, 58_000],
  [10, 62_000],
  [12, 72_000],
  [15, 87_000],
];

const describe = (n: number) =>
  `<p>Combo de <strong>${n} cápsulas sorpresa</strong>. Cada cápsula trae un artículo de la tienda escogido al azar.</p>` +
  "<p>El contenido no se puede escoger y puede repetirse entre cápsulas. Puede venir, por ejemplo, un lapicero, notas adhesivas, stickers, una libreta o un accesorio.</p>";

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-combos-create.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement } = await import("@/lib/inventory");
  const { generateSemanticSKU } = await import("@/lib/variant-generator");
  const { getUniqueProductSlug } = await import("@/lib/product-slugs");
  const { generateProductSlug } = await import("@/lib/slugify");
  const { normalizeProductIdentifiers } = await import("@/lib/product-identifiers");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const [category, design, color, size] = await Promise.all([
      db.category.findFirst({ where: { storeId: STORE_ID, name: CATEGORY }, select: { id: true, name: true } }),
      db.design.findFirst({ where: { storeId: STORE_ID, name: DESIGN }, select: { id: true, name: true } }),
      db.color.findFirst({ where: { storeId: STORE_ID, name: COLOR }, select: { id: true, name: true } }),
      db.size.findFirst({ where: { storeId: STORE_ID, name: SIZE }, select: { id: true, name: true, value: true } }),
    ]);
    if (!category || !design || !color || !size) throw new Error("falta la categoría, el diseño, el color o la talla del catálogo.");

    const names = COMBOS.map(([n]) => `Cápsula sorpresa x${n}`);
    const existing = new Set((await db.product.findMany({ where: { storeId: STORE_ID, name: { in: names } }, select: { name: true } })).map((p) => p.name));
    const identifiers = normalizeProductIdentifiers({ hasNoProductIdentifier: true, defaultNoIdentifierWhenEmpty: true });

    const plan = COMBOS.map(([n, price]) => {
      const cost = n * COST_PER_CAPSULE;
      return {
        nombre: `Cápsula sorpresa x${n}`,
        capsulas: n,
        precio: price,
        precioPorCapsula: Math.round(price / n),
        costo: cost,
        margen: `${Math.round(((price - cost) / price) * 1000) / 10} %`,
        stockCombos: Math.floor(PROVISIONAL_CAPSULES / n),
        estado: existing.has(`Cápsula sorpresa x${n}`) ? "ya existe" : "por crear",
      };
    });
    const below = plan.filter((row) => row.precio <= row.costo);
    console.log(JSON.stringify({ categoria: category.name, diseno: design.name, color: color.name, talla: size.name, costoPorCapsula: COST_PER_CAPSULE, combos: plan }, null, 1));
    if (below.length) throw new Error(`precio por debajo del costo: ${below.map((r) => r.nombre).join(", ")}.`);
    const todo = plan.filter((row) => row.estado === "por crear");
    console.log(`Resumen: ${plan.length} combos · por crear ${todo.length} · ya existen ${plan.length - todo.length}`);
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const created: string[] = [];
    for (const row of todo) {
      const product = await db.$transaction(async (tx) => {
        if (await tx.product.findFirst({ where: { storeId: STORE_ID, name: row.nombre }, select: { id: true } })) return null;
        let sku = generateSemanticSKU(category.name, design.name, color.name, size.value || size.name);
        for (let i = 0; i < 5 && (await tx.product.findUnique({ where: { sku }, select: { id: true } })); i++) {
          sku = generateSemanticSKU(category.name, design.name, color.name, size.value || size.name);
        }
        const slug = await getUniqueProductSlug(tx, { storeId: STORE_ID, baseSlug: generateProductSlug({ name: row.nombre }) });
        const createdProduct = await tx.product.create({
          data: {
            storeId: STORE_ID,
            name: row.nombre,
            slug,
            sku,
            price: row.precio,
            acqPrice: row.costo,
            description: describe(row.capsulas),
            stock: 0,
            availableAt: AVAILABLE_AT,
            categoryId: category.id,
            designId: design.id,
            colorId: color.id,
            sizeId: size.id,
            ...identifiers,
          },
          select: { id: true, sku: true },
        });
        await createInventoryMovement(tx, {
          storeId: STORE_ID,
          productId: createdProduct.id,
          type: "INITIAL_INTAKE",
          quantity: row.stockCombos,
          reason: "Inventario inicial al crear producto",
          description: `Provisional: ${PROVISIONAL_CAPSULES} cápsulas armadas por Paula ÷ ${row.capsulas} por combo.`,
          cost: row.costo,
          createdBy: "SYSTEM",
        });
        return createdProduct;
      });
      if (product) created.push(`${row.nombre}=${product.sku}`);
    }
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} capsule-combos-create · ${created.length} productos en «${CATEGORY}»: ${created.join(", ")} · costo ${COST_PER_CAPSULE}/cápsula · stock ${PROVISIONAL_CAPSULES} cápsulas ÷ N · DESHACER archivando los productos desde Productos (el INITIAL_INTAKE queda en el kardex).\n`,
    );
    console.log(`Creados: ${created.length} · ${created.join(", ")}`);
    console.log(`PROD_WRITE_ROWS=${created.length * 2}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
