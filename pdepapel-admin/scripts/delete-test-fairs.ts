/**
 * Borra los datos de prueba de las ferias (Christian, 2026-11-01), en este orden:
 *   1. «Villaterra Halloween»: la feria, sus filas y sus recetas congeladas. Su
 *      kardex (FESTIVAL_ALLOCATION/RETURN de productos reales) se conserva.
 *   2. Los 22 kits archivados de esa feria («Mini kit sorpresa 1–20», «Combo mini
 *      kit 21/22») por el camino de borrar producto del panel
 *      (`getProductDeleteCheck`, reseñas, imágenes, `recordDeletedProductUrls`,
 *      receta, producto).
 *   3. Las dos ferias «(borrar)» con su pedido de prueba (ítems y registro de
 *      pago), su kardex de feria (solo si cada producto queda en cero neto) y
 *      sus filas. Christian autorizó pasar por encima del guardia que impide
 *      borrar ventas de feria, solo para estos dos pedidos.
 *   4. El comprobante de la transferencia de prueba en R2 (`deletePaymentProof`),
 *      después de que confirme la transacción de su feria.
 * Una transacción por entidad (Villaterra, cada kit, cada feria de prueba): en
 * una sola, 22 kits a ~85 ms por consulta pasaron de 60 s (2026-11-01). Si se
 * corta a mitad, otra corrida salta lo ya borrado. Antes de borrar guarda una
 * copia JSON (`--snapshot`; si el archivo existe no lo pisa, escribe otro con
 * fecha). No cambia el stock de ningún producto.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run scripts/delete-test-fairs.ts --snapshot <ruta.json> --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- scripts/delete-test-fairs.ts --snapshot <ruta.json> --apply --expect new
 *
 * prod-write-models: FairEvent, FairEventInventoryItem, FairEventKitComponent, Product, ProductKit, Image, Review, DeletedProductUrl, Order, OrderItem, PaymentDetails, InventoryMovement
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const VILLATERRA = { id: "ca97b774-254d-450d-81a4-a316f712baeb", rows: 22, moves: 182 };
const TEST_FAIRS = [
  { id: "df33fa4b-f32b-4f51-aaf3-e657f9c2d2a8", order: "ORD-1790445257739-123" },
  { id: "bb327b0f-1e96-42fd-8941-d72044652493", order: "ORD-1790442243672-27" },
];
const KIT_NAMES = [...Array.from({ length: 20 }, (_, i) => `Mini kit sorpresa ${i + 1}`), "Combo mini kit 21", "Combo mini kit 22"];
const ORDER_REF_MODELS = [
  "orderPayment", "invoice", "couponRedemption", "giftCardMovement", "orderNotification", "failedNotification",
  "orderInventoryIssue", "conversation", "stockReservation", "paymentWebhookEvent", "orderAccountClaim",
  "capsuleOrder", "capsuleSlip", "capsuleDailySlot", "preorderWaitlistEntry", "quoteRequest", "whatsAppAdminCommand", "shipping",
] as const;

const argValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = argValue(args, "--snapshot");
  const apply = args.includes("--apply");
  if (!snapshotPath) throw new Error("falta --snapshot.");

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/delete-test-fairs.ts … --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  const { getProductDeleteCheck } = await import("@/lib/product-deletion");
  const { recordDeletedProductUrls } = await import("@/lib/deleted-product-urls");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const problems: string[] = [];

    // 1. Villaterra.
    const villaterra = await db.fairEvent.findFirst({ where: { id: VILLATERRA.id, storeId: STORE_ID } });
    const vRows = await db.fairEventInventoryItem.findMany({ where: { fairEventId: VILLATERRA.id }, include: { kitComponents: true } });
    const vOrders = await db.order.count({ where: { fairEventId: VILLATERRA.id } });
    const vCapsules = await db.fairCapsule.count({ where: { fairEventId: VILLATERRA.id } });
    const vMoves = await db.inventoryMovement.count({ where: { referenceId: VILLATERRA.id } });
    if (villaterra && villaterra.status !== "CLOSED") problems.push(`Villaterra está ${villaterra.status}`);
    if (vRows.length !== (villaterra ? VILLATERRA.rows : 0)) problems.push(`Villaterra tiene ${vRows.length} filas, se esperaban ${villaterra ? VILLATERRA.rows : 0}`);
    if (vOrders || vCapsules) problems.push(`Villaterra tiene ${vOrders} pedidos y ${vCapsules} cápsulas`);
    if (vRows.some((row) => row.soldQuantity > 0)) problems.push("Villaterra tiene filas con ventas");
    if (vMoves !== VILLATERRA.moves) problems.push(`Villaterra tiene ${vMoves} movimientos, se esperaban ${VILLATERRA.moves} (se conservan)`);

    // 2. Kits archivados de Villaterra.
    const kits = await db.product.findMany({
      where: { storeId: STORE_ID, name: { in: KIT_NAMES } },
      include: { images: true, kitComponents: true, reviews: true },
    });
    const missingKits = KIT_NAMES.filter((name) => !kits.some((kit) => kit.name === name));
    if (kits.length + missingKits.length !== KIT_NAMES.length) problems.push(`hay kits con nombre repetido (${kits.length} encontrados)`);
    const villaterraProductIds = new Set(vRows.map((row) => row.productId));
    for (const kit of kits) {
      if (!kit.isKit || !kit.isArchived) problems.push(`${kit.name} no es un kit archivado`);
      if (kit.images.length) problems.push(`${kit.name} tiene imágenes (no se borran desde aquí)`);
      if (kit.productGroupId) problems.push(`${kit.name} está en un grupo`);
      const check = await getProductDeleteCheck(db as never, { storeId: STORE_ID, productId: kit.id });
      const other = (check?.blockers ?? []).filter((b) => !(b.kind === "ferias" && villaterraProductIds.has(kit.id) && b.count === 1));
      if (other.length) problems.push(`${kit.name}: ${other.map((b) => `${b.label} ${b.count}`).join(", ")}`);
    }

    // 3. Ferias de prueba.
    const tests: {
      fair: Awaited<ReturnType<typeof db.fairEvent.findFirst>>;
      rows: Awaited<ReturnType<typeof db.fairEventInventoryItem.findMany<{ include: { kitComponents: true } }>>>;
      orders: Awaited<ReturnType<typeof db.order.findMany<{ include: { orderItems: true; payment: true } }>>>;
      moves: Awaited<ReturnType<typeof db.inventoryMovement.findMany>>;
    }[] = [];
    for (const t of TEST_FAIRS) {
      const fair = await db.fairEvent.findFirst({ where: { id: t.id, storeId: STORE_ID } });
      const rows = await db.fairEventInventoryItem.findMany({ where: { fairEventId: t.id }, include: { kitComponents: true } });
      const orders = await db.order.findMany({ where: { fairEventId: t.id }, include: { orderItems: true, payment: true } });
      const capsules = await db.fairCapsule.count({ where: { fairEventId: t.id } });
      const moves = await db.inventoryMovement.findMany({ where: { referenceId: t.id } });
      const orderIds = orders.map((o) => o.id);
      const orderMoves = orderIds.length ? await db.inventoryMovement.count({ where: { referenceId: { in: orderIds } } }) : 0;
      const refs: Record<string, number> = {};
      for (const model of ORDER_REF_MODELS) {
        const n = await (db as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[model].count({ where: { orderId: { in: orderIds } } });
        if (n) refs[model] = n;
      }
      const cash = await db.businessCashMovement.count({
        where: { storeId: STORE_ID, OR: [{ reference: { contains: t.order } }, { description: { contains: t.order } }, ...orderIds.map((id) => ({ reference: { contains: id } }))] },
      });
      const net = new Map<string, number>();
      for (const m of moves) if (m.productId) net.set(m.productId, (net.get(m.productId) ?? 0) + m.quantity);

      if (!fair) {
        const leftovers = (await db.order.count({ where: { orderNumber: t.order } })) + rows.length + moves.length;
        if (leftovers) problems.push(`la feria ${t.id} ya no existe pero quedan ${leftovers} filas suyas (pedido, filas o kardex)`);
        tests.push({ fair, rows, orders, moves });
        continue;
      }
      if (fair.status !== "CLOSED" || !/\(borrar\)/.test(fair.name)) problems.push(`${fair.name}: no es una feria «(borrar)» cerrada`);
      if (orders.length !== 1 || orders[0].orderNumber !== t.order) problems.push(`${t.id}: pedidos ${orders.map((o) => o.orderNumber).join(", ") || "ninguno"}, se esperaba ${t.order}`);
      for (const o of orders) if (o.status !== "CANCELLED" || o.paidAt) problems.push(`${o.orderNumber} no es un pedido cancelado sin pagar`);
      for (const o of orders) if (o.payment && !["CASH", "BankTransfer"].includes(o.payment.method)) problems.push(`${o.orderNumber}: método ${o.payment.method}`);
      if (capsules) problems.push(`${t.id}: tiene ${capsules} cápsulas`);
      if (orderMoves) problems.push(`${t.order}: tiene ${orderMoves} movimientos de kardex propios`);
      if (Object.keys(refs).length) problems.push(`${t.order}: otras referencias ${JSON.stringify(refs)}`);
      if (cash) problems.push(`${t.order}: aparece en ${cash} movimientos de caja`);
      if (Array.from(net.values()).some((value) => value !== 0)) problems.push(`${t.id}: algún producto no queda en cero neto en su kardex de feria`);
      tests.push({ fair, rows, orders, moves });
    }
    const pending = tests.filter((t) => t.fair);

    const summary = {
      villaterra: { borra: { FairEvent: villaterra ? 1 : 0, FairEventInventoryItem: vRows.length, FairEventKitComponent: vRows.reduce((s, r) => s + r.kitComponents.length, 0) }, conserva: { InventoryMovement: vMoves } },
      kits: { yaBorrados: missingKits.length, borra: { Product: kits.length, ProductKit: kits.reduce((s, k) => s + k.kitComponents.length, 0), Image: kits.reduce((s, k) => s + k.images.length, 0), Review: kits.reduce((s, k) => s + k.reviews.length, 0), DeletedProductUrl: "se registran sus slugs (como el panel)" } },
      villaterraYaBorrada: !villaterra,
      pruebas: pending.map((t) => ({
        feria: t.fair?.name,
        borra: { FairEvent: 1, FairEventInventoryItem: t.rows.length, FairEventKitComponent: t.rows.reduce((s, r) => s + r.kitComponents.length, 0), Order: t.orders.length, OrderItem: t.orders.reduce((s, o) => s + o.orderItems.length, 0), PaymentDetails: t.orders.filter((o) => o.payment).length, InventoryMovement: t.moves.length },
        pedidos: t.orders.map((o) => `${o.orderNumber} ${o.status} $${o.total} pago ${o.payment?.method ?? "-"}`),
      })),
      pruebasYaBorradas: tests.length - pending.length,
      comprobantesR2: pending.flatMap((t) => t.orders).filter((o) => o.payment?.proofKey).length,
      bloqueos: problems,
    };
    console.log(JSON.stringify(summary, null, 1));
    if (problems.length) throw new Error(`no se borra: ${problems.join("; ")}.`);
    if (!apply) {
      console.log("Ensayo: todo listo; el stock de ningún producto cambia (los movimientos que se borran suman cero por producto).");
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const target = existsSync(resolve(snapshotPath)) ? resolve(snapshotPath).replace(/\.json$/, `.${new Date().toISOString().replace(/[:.]/g, "-")}.json`) : resolve(snapshotPath);
    writeFileSync(target, JSON.stringify({ savedAt: new Date().toISOString(), villaterra: { fair: villaterra, rows: vRows }, kits, tests: pending }, null, 1));
    console.log(`Copia: ${target}`);

    const done: string[] = [];
    const timings: { step: string; ms: number }[] = [];
    const proofsLeft: string[] = [];
    let rows = 0;
    const step = async (name: string, work: (tx: Prisma.TransactionClient) => Promise<number>) => {
      const started = performance.now();
      rows += await db.$transaction(work);
      const ms = Math.round(performance.now() - started);
      timings.push({ step: name, ms });
      done.push(name);
      console.log(`  ✓ ${name} (${ms} ms)`);
    };

    try {
      if (villaterra) {
        await step("Villaterra Halloween", async (tx) => {
          const a = await tx.fairEventKitComponent.deleteMany({ where: { inventoryItem: { fairEventId: VILLATERRA.id } } });
          const b = await tx.fairEventInventoryItem.deleteMany({ where: { fairEventId: VILLATERRA.id } });
          await tx.fairEvent.delete({ where: { id: VILLATERRA.id } });
          return a.count + b.count + 1;
        });
      }

      for (const kit of kits) {
        await step(kit.name, async (tx) => {
          const check = await getProductDeleteCheck(tx as never, { storeId: STORE_ID, productId: kit.id });
          if (!check || check.blocked) throw new Error(`${kit.name} sigue bloqueado: ${JSON.stringify(check?.blockers ?? [])}`);
          const r = await tx.review.deleteMany({ where: { productId: kit.id, storeId: STORE_ID } });
          const i = await tx.image.deleteMany({ where: { productId: kit.id } });
          await recordDeletedProductUrls(tx as never, STORE_ID, [kit]);
          const k = await tx.productKit.deleteMany({ where: { kitId: kit.id } });
          await tx.product.delete({ where: { id: kit.id, storeId: STORE_ID } });
          return r.count + i.count + k.count + 1;
        });
      }

      const { deletePaymentProof } = await import("@/lib/payment-proofs");
      for (const t of pending) {
        const fairId = t.fair!.id;
        const orderIds = t.orders.map((o) => o.id);
        await step(t.fair!.name, async (tx) => {
          const counts = [
            await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
            await tx.paymentDetails.deleteMany({ where: { orderId: { in: orderIds } } }),
            await tx.order.deleteMany({ where: { id: { in: orderIds } } }),
            await tx.inventoryMovement.deleteMany({ where: { referenceId: fairId } }),
            await tx.fairEventKitComponent.deleteMany({ where: { inventoryItem: { fairEventId: fairId } } }),
            await tx.fairEventInventoryItem.deleteMany({ where: { fairEventId: fairId } }),
          ];
          await tx.fairEvent.delete({ where: { id: fairId } });
          return counts.reduce((sum, c) => sum + c.count, 1);
        });
        for (const key of t.orders.map((o) => o.payment?.proofKey).filter((k): k is string => Boolean(k))) {
          try {
            if (!(await deletePaymentProof(key, STORE_ID))) throw new Error("la clave no es un comprobante de esta tienda");
            console.log("  ✓ comprobante R2 borrado");
          } catch (error) {
            proofsLeft.push(key);
            console.error(`  ✗ comprobante R2 sin borrar (${error instanceof Error ? error.message : error}): ${key}`);
          }
        }
      }
    } catch (error) {
      appendFileSync(
        resolve(process.cwd(), "ops/prod-writes.log"),
        `# ${new Date().toISOString()} delete-test-fairs CORTADO · hechos ${done.length}: ${done.join(", ") || "ninguno"} · copia en ${target} · otra corrida salta lo ya borrado.\n`,
      );
      throw error;
    }

    const slowest = timings.reduce((max, t) => (t.ms > max.ms ? t : max), { step: "-", ms: 0 });
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} delete-test-fairs · ${timings.length} transacciones (la más lenta: ${slowest.step}, ${slowest.ms} ms) · Villaterra Halloween ${villaterra ? `(feria + ${vRows.length} filas)` : "ya borrada"}, kardex de ${vMoves} movimientos conservado · ${kits.length} kits archivados (${missingKits.length} ya borrados) · ferias de prueba con pedido, pago y ${pending.reduce((s, t) => s + t.moves.length, 0)} movimientos en cero neto · comprobantes R2 sin borrar: ${proofsLeft.length ? proofsLeft.join(", ") + " (borrar a mano)" : "ninguno"} · copia en ${target} · DESHACER: reinsertar desde la copia (el comprobante R2 no se recupera).\n`,
    );
    console.log(`Listo: ${timings.length} transacciones; la más lenta «${slowest.step}» ${slowest.ms} ms.`);
    console.log(`PROD_WRITE_ROWS=${rows}`);
    if (proofsLeft.length) throw new Error(`la base quedó borrada pero ${proofsLeft.length} comprobante(s) R2 siguen en el bucket: ${proofsLeft.join(", ")}. Bórralos a mano.`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
