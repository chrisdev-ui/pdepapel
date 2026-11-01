/**
 * Mini kits de una feria a partir de un plan JSON (los que Paula armó a mano),
 * por los mismos caminos del panel:
 *   1. categoría «Kits sorpresa» creada ya archivada (no sale en el menú de la tienda); con
 *      `--reuse-category` usa la que ya existe con ese nombre y no la toca;
 *   2. ajustes de conteo físico (`MANUAL_ADJUSTMENT`, lo que Paula tiene en mano);
 *   3. paquetes abiertos para sacar piezas sueltas (`MANUAL_ADJUSTMENT` negativo);
 *   4. un producto kit por contenido distinto (receta solo con unidades enteras), con
 *      su stock derivado (`recalculateKitStock`);
 *   5. reserva en la feria con `allocateFairInventory` (un `FESTIVAL_ALLOCATION` por
 *      pieza y la receta congelada en `FairEventKitComponent`);
 *   6. los kits quedan archivados: la feria los vende (la venta no mira `isArchived`)
 *      y la tienda en línea no los muestra.
 * Los pasos 4–6 van kit por kit (una transacción corta cada uno); si uno falla, los
 * que ya se crearon quedan archivados y el informe dice cuáles quedaron reservados.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run scripts/fair-mini-kits.ts --plan <ruta> --template <SKU de kit> --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- scripts/fair-mini-kits.ts --plan <ruta> --template <SKU de kit> --apply --expect new
 *
 * prod-write-models: Category, Product, ProductKit, InventoryMovement, MarketplaceOutboxEvent, FairEventInventoryItem, FairEventKitComponent
 */
import "./lib/allow-server-only.cjs";

import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

type Plan = {
  fairEventId: string;
  categoryName: string;
  kits: {
    n: number;
    qty: number;
    paula: string[];
    price: number;
    combo: boolean;
    name: string;
    components: { sku: string; id: string; name: string; quantity: number }[];
    pieces: { sku: string; name: string }[];
  }[];
  adjustments: { sku: string; id: string; quantity: number; reason: string }[];
  openedPacks: { sku: string; id: string; quantity: number; reason: string }[];
};

const argValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

async function main() {
  const args = process.argv.slice(2);
  const planPath = argValue(args, "--plan");
  const templateSku = argValue(args, "--template");
  const storeId = argValue(args, "--store") ?? DEFAULT_STORE_ID;
  const apply = args.includes("--apply");
  const reuseCategory = args.includes("--reuse-category");
  if (!planPath || !templateSku) throw new Error("faltan --plan o --template.");
  const planText = readFileSync(resolve(planPath), "utf8");
  const plan = JSON.parse(planText) as Plan;
  const planHash = createHash("sha256").update(planText).digest("hex").slice(0, 16);

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/fair-mini-kits.ts … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  // Mismas opciones de transacción que `lib/prismadb.ts`: con las de Prisma (5 s) una reserva desde fuera de Vercel se corta.
  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  // Los helpers del panel usan el cliente global: en la corrida real es el cliente con guardas.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement, recalculateKitStock } = await import("@/lib/inventory");
  const { allocateFairInventory } = await import("@/lib/fair-events");
  const { owedPresaleUnits, sellableStock } = await import("@/lib/presale-owed");
  const { generateSemanticSKU } = await import("@/lib/variant-generator");
  const { generateProductSlug } = await import("@/lib/slugify");
  const { getUniqueProductSlug } = await import("@/lib/product-slugs");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const fair = await db.fairEvent.findFirst({ where: { id: plan.fairEventId, storeId }, select: { id: true, name: true, status: true, _count: { select: { inventoryItems: true } } } });
    const template = await db.product.findFirst({
      where: { storeId, sku: templateSku, isKit: true },
      select: { id: true, name: true, sizeId: true, colorId: true, designId: true, category: { select: { typeId: true, type: { select: { name: true } } } }, size: { select: { name: true, value: true } }, color: { select: { name: true } }, design: { select: { name: true } } },
    });
    const existingCategory = await db.category.findFirst({ where: { storeId, name: plan.categoryName }, select: { id: true, name: true, isArchived: true, typeId: true } });
    const existingKits = await db.product.findMany({ where: { storeId, name: { in: plan.kits.map((k) => k.name) } }, select: { name: true } });

    const touchedIds = Array.from(new Set([...plan.kits.flatMap((k) => k.components.map((c) => c.id)), ...plan.adjustments.map((a) => a.id), ...plan.openedPacks.map((o) => o.id)]));
    const products = await db.product.findMany({ where: { id: { in: touchedIds }, storeId }, select: { id: true, sku: true, name: true, stock: true, reservedUnits: true, isKit: true, isArchived: true, acqPrice: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    const owed = await owedPresaleUnits(db, touchedIds);
    const otherFairs = await db.fairEventInventoryItem.findMany({ where: { productId: { in: touchedIds }, fairEvent: { storeId, status: { in: ["DRAFT", "OPEN", "RECONCILING"] } } }, select: { productId: true } });

    const delta = new Map<string, number>();
    for (const a of [...plan.adjustments, ...plan.openedPacks]) delta.set(a.id, (delta.get(a.id) ?? 0) + a.quantity);
    const need = new Map<string, number>();
    for (const k of plan.kits) for (const c of k.components) need.set(c.id, (need.get(c.id) ?? 0) + c.quantity * k.qty);

    const problems: string[] = [];
    if (!fair) problems.push("la feria no existe en esta tienda");
    else if (fair.status !== "DRAFT" && fair.status !== "OPEN") problems.push(`la feria está ${fair.status}`);
    if (!template) problems.push(`no hay kit plantilla con SKU ${templateSku}`);
    if (existingCategory && !reuseCategory) problems.push(`ya existe la categoría «${plan.categoryName}» (usa --reuse-category)`);
    if (!existingCategory && reuseCategory) problems.push(`--reuse-category sin categoría «${plan.categoryName}»`);
    if (existingKits.length) problems.push(`ya existen kits con esos nombres: ${existingKits.map((k) => k.name).join(", ")}`);
    if (otherFairs.length) problems.push(`${otherFairs.length} piezas ya están en una feria activa`);
    const stockRows = touchedIds.map((id) => {
      const p = byId.get(id);
      if (!p) { problems.push(`producto ${id} no existe`); return null; }
      if (p.isKit || p.isArchived) problems.push(`${p.sku} es kit o está archivado`);
      const sellable = sellableStock(p, owed.get(id) ?? 0);
      const after = sellable + (delta.get(id) ?? 0) - (need.get(id) ?? 0);
      if (p.stock + (delta.get(id) ?? 0) < 0) problems.push(`${p.sku}: el ajuste deja el stock en negativo`);
      if (after < 0) problems.push(`${p.sku}: faltan ${-after} para las reservas`);
      return { sku: p.sku, nombre: p.name, stock: p.stock, vendible: sellable, ajuste: delta.get(id) ?? 0, reserva: need.get(id) ?? 0, quedaVendible: after, stockFinal: p.stock + (delta.get(id) ?? 0) - (need.get(id) ?? 0) };
    }).filter(Boolean);

    const kitRows = plan.kits.map((k) => {
      const cost = k.components.reduce((sum, c) => sum + Number(byId.get(c.id)?.acqPrice ?? 0) * c.quantity, 0);
      if (k.price < cost) problems.push(`${k.name}: precio ${k.price} por debajo del costo ${cost}`);
      return { kit: k.name, precio: k.price, reservar: k.qty, costoReceta: Math.round(cost), receta: k.components.map((c) => `${c.quantity}× ${c.sku}`).join(" + "), deLaFeria: k.paula.join(", ") };
    });

    console.log(JSON.stringify({ plan: planPath, planHash, feria: fair ? { nombre: fair.name, estado: fair.status, filas: fair._count.inventoryItems } : null, plantilla: template ? { nombre: template.name, tipo: template.category.type.name } : null, categoria: existingCategory ? `${existingCategory.name} (existente ${existingCategory.id}, ${existingCategory.isArchived ? "archivada" : "activa"}; no se toca)` : `${plan.categoryName} (nueva, archivada)`, kits: kitRows, ajustes: plan.adjustments.map((a) => `${a.sku} ${a.quantity > 0 ? "+" : ""}${a.quantity} «${a.reason}»`), paquetesAbiertos: plan.openedPacks.map((o) => `${o.sku} ${o.quantity} «${o.reason}»`), stock: stockRows, bloqueos: problems }, null, 1));
    if (problems.length) throw new Error(`no se escribe: ${problems.join("; ")}.`);

    const unitsReserved = plan.kits.reduce((sum, k) => sum + k.qty, 0);
    const movements = plan.adjustments.length + plan.openedPacks.length + plan.kits.reduce((sum, k) => sum + k.components.length, 0);
    if (!apply) {
      console.log(`Ensayo: ${existingCategory ? "categoría existente" : "1 categoría archivada"}, ${plan.kits.length} kits (${unitsReserved} unidades reservadas), ${plan.adjustments.length} ajustes de conteo, ${plan.openedPacks.length} paquetes abiertos, ≈${movements} movimientos de kardex; los kits quedan archivados.`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const now = new Date();
    const category = existingCategory
      ? { id: existingCategory.id, name: existingCategory.name }
      : await db.category.create({
          data: { storeId, typeId: template!.category.typeId, name: plan.categoryName, slug: generateProductSlug({ name: plan.categoryName }), isArchived: true, archivedAt: now },
          select: { id: true, name: true },
        });

    for (const a of [...plan.adjustments, ...plan.openedPacks]) {
      await db.$transaction((tx) =>
        createInventoryMovement(tx, { storeId, productId: a.id, type: "MANUAL_ADJUSTMENT", quantity: a.quantity, reason: a.reason, description: `${plan.categoryName} · ${fair!.name}`, createdBy: "SYSTEM" }),
      );
    }

    const kitIds: string[] = [];
    const reserved: string[] = [];
    try {
      for (const k of plan.kits) {
        let sku = "";
        for (let attempt = 0; attempt < 5 && !sku; attempt++) {
          const candidate = generateSemanticSKU(category.name, template!.design.name, template!.color.name, template!.size.value || template!.size.name);
          if (!(await db.product.findUnique({ where: { sku: candidate }, select: { id: true } }))) sku = candidate;
        }
        if (!sku) throw new Error(`no se encontró un SKU libre para ${k.name}`);
        const slug = await getUniqueProductSlug(db, { storeId, baseSlug: generateProductSlug({ name: k.name }) });
        const cost = k.components.reduce((sum, c) => sum + Number(byId.get(c.id)!.acqPrice ?? 0) * c.quantity, 0);
        const pieces = k.pieces.length ? ` Lleva además, fuera del sistema: ${k.pieces.map((p) => `1 pieza de ${p.name}`).join(", ")}.` : "";
        const product = await db.product.create({
          data: {
            storeId,
            name: k.name,
            slug,
            sku,
            price: k.price,
            acqPrice: Math.round(cost * 100) / 100,
            description: `<p>${k.combo ? "Combo" : "Mini kit sorpresa"} armado por Paula para la feria ${fair!.name} (sus kits ${k.paula.join(", ")}). Solo se vende en la feria.${pieces}</p>`,
            stock: 0,
            categoryId: category.id,
            sizeId: template!.sizeId,
            colorId: template!.colorId,
            designId: template!.designId,
            isKit: true,
            kitComponents: { create: k.components.map((c) => ({ componentId: c.id, quantity: c.quantity })) },
          },
          select: { id: true },
        });
        kitIds.push(product.id);
        await recalculateKitStock(db, [product.id]);
        await allocateFairInventory({ storeId, fairEventId: plan.fairEventId, allocations: [{ productId: product.id, quantity: k.qty }], userId: "SYSTEM" });
        await db.product.update({ where: { id: product.id }, data: { isArchived: true } });
        reserved.push(`${k.name} ×${k.qty} (${sku})`);
        console.log(`  ✓ ${k.name} ×${k.qty} · ${sku}`);
      }
    } finally {
      if (kitIds.length) await db.product.updateMany({ where: { id: { in: kitIds }, isArchived: false }, data: { isArchived: true } });
      if (reserved.length < plan.kits.length) console.error(`Reservados ${reserved.length} de ${plan.kits.length}: ${reserved.join("; ") || "ninguno"}. Los kits creados quedaron archivados.`);
    }

    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} fair-mini-kits plan ${planHash} · feria ${fair!.name} · categoría ${category.id}${existingCategory ? " (existente)" : " (nueva, archivada)"} · ${kitIds.length} kits archivados (${unitsReserved} reservados) · ${plan.adjustments.length} conteos + ${plan.openedPacks.length} paquetes abiertos · DESHACER: cerrar la feria devuelve las piezas; los ajustes se corrigen con otro ajuste desde Inventario, nunca borrando movimientos.\n`,
    );
    console.log(`Listo: ${kitIds.length} kits creados, reservados y archivados en «${fair!.name}».`);
    console.log(`PROD_WRITE_ROWS=${(existingCategory ? 0 : 1) + kitIds.length + movements}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
