/**
 * ORD-1793744962855-67 (2026-11-03): Paula registró una venta de cápsulas antes de que existieran los combos, con seis
 * productos de relleno y un descuento fijo de $20.300 para llegar a los $49.000 del combo x7. La clienta compró el combo
 * x7 y los Marcadores ETERNA x36 ($57.700); lo confirmó Paula.
 *
 * Deja el pedido como lo habría dejado el panel al editarlo en PENDIENTE: las seis líneas de relleno salen, entra una
 * línea «Cápsula sorpresa x7» con su precio, los Marcadores quedan como estaban y el descuento queda en 0 sin tipo ni
 * motivo. El envío ($15.000) no cambia, así que el total sigue en $121.700. Un pedido PENDIENTE no ha movido inventario
 * ni tiene pagos: no hay kardex que devolver ni aviso a la clienta (el panel solo avisa cuando cambia el estado).
 * El panel no sirve hoy para esto: «Quitar descuento» en un pedido guardado deja el tipo FIXED y no deja guardar.
 *
 * Se niega a escribir si el pedido ya no está exactamente como se leyó (estado, pago, líneas, totales, movimientos,
 * reserva convertida, cápsulas de feria o preventas).
 *
 * En la misma escritura vuelve a la tienda «Bloques de construcción Navidad» (salió como premio en una cápsula de este
 * pedido; Paula lo quiere de vuelta para la temporada), con su precio actual, como lo hace «Restaurar» en Productos:
 * solo `isArchived`. Restaurar no reactiva publicaciones de Mercado Libre (no tiene). Antes de restaurarlo se descuenta
 * la unidad que salió como premio en una cápsula de este pedido (MANUAL_ADJUSTMENT −1, referencia ORD-…:SKU), así la
 * tienda muestra lo que queda. Los otros seis premios esperan las fotos de los papelitos. La tienda lo muestra cuando
 * vence su ISR (≤ 5 min).
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/order-capsule-combo-fix.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/order-capsule-combo-fix.ts --apply --expect new
 *
 * prod-write-models: Order, OrderItem, Product, InventoryMovement, MarketplaceOutboxEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const ORDER_NUMBER = "ORD-1793744962855-67";
const COMBO_NAME = "Cápsula sorpresa x7";
const COMBO_PRICE = 49_000;
const KEEP_SKU = "MAR-CLS-MUL-M-P-9594";
const KEEP_PRICE = 57_700;
const PLACEHOLDER_SKUS = [
  "NOT-ART-VER-S-L-5447",
  "KIT-SOR-MUL-S-P-4873",
  "LLA-PER-NEG-S-P-7598",
  "BOL-INT-LIL-S-L-8778",
  "BOL-MOD-BLA-S-L-1317",
  "FOL-CLS-AZU-S-P-5584",
];
const EXPECTED = { subtotal: 127_000, discount: 20_300, total: 121_700, shippingCost: 15_000 };
const RESTORE_SKU = "LEG-VEG-ROJ-S-L-5037";
const RESTORE_PRICE = 10_000;
const PRIZE_REFERENCE = `${ORDER_NUMBER}:${RESTORE_SKU}`;
const PRIZE_REASON = `Salió en cápsula · ${ORDER_NUMBER} (producto estaba archivado)`;
const NEW_SUBTOTAL = COMBO_PRICE + KEEP_PRICE;

function fail(message: string): never {
  throw new Error(`${ORDER_NUMBER}: ${message} No se escribió nada.`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/order-capsule-combo-fix.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { getOrderItemBrandNames, orderItemBrandName } = await import("@/lib/order-item-brand");
  const { createInventoryMovement } = await import("@/lib/inventory");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const plan = await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { storeId: STORE_ID, orderNumber: ORDER_NUMBER },
        select: {
          id: true, status: true, paidAt: true, subtotal: true, discount: true, discountType: true, discountReason: true,
          couponId: true, couponDiscount: true, giftCardAmount: true, total: true, updatedAt: true,
          shipping: { select: { cost: true, codFee: true, provider: true, envioClickIdOrder: true } },
          orderItems: { select: { id: true, sku: true, price: true, quantity: true, isPreorder: true, productId: true, fairCapsule: { select: { id: true } } } },
          _count: { select: { payments: true } },
        },
      });
      if (!order) fail("no existe en la tienda.");
      if (order.status !== "PENDING" || order.paidAt) fail(`ya no está PENDIENTE sin pagar (estado ${order.status}).`);
      if (order._count.payments > 0) fail("tiene pagos registrados.");
      if (order.subtotal !== EXPECTED.subtotal || order.discount !== EXPECTED.discount || order.total !== EXPECTED.total) {
        fail(`los totales cambiaron (subtotal ${order.subtotal}, descuento ${order.discount}, total ${order.total}).`);
      }
      if (order.couponId || order.couponDiscount || order.giftCardAmount) fail("tiene cupón o tarjeta de regalo.");
      if (Number(order.shipping?.cost ?? 0) !== EXPECTED.shippingCost || Number(order.shipping?.codFee ?? 0) !== 0) fail("el envío cambió.");
      if (order.shipping?.envioClickIdOrder) fail("ya tiene guía de EnvioClick.");

      const skus = order.orderItems.map((item) => item.sku).sort();
      const expectedSkus = [...PLACEHOLDER_SKUS, KEEP_SKU].sort();
      if (JSON.stringify(skus) !== JSON.stringify(expectedSkus)) fail(`las líneas cambiaron (${skus.join(", ")}).`);
      if (order.orderItems.some((item) => item.quantity !== 1 || item.isPreorder || item.fairCapsule)) fail("alguna línea no es una unidad normal.");
      const keep = order.orderItems.find((item) => item.sku === KEEP_SKU)!;
      if (keep.price !== KEEP_PRICE) fail(`los Marcadores ya no valen ${KEEP_PRICE}.`);

      const [movements, reservation] = await Promise.all([
        tx.inventoryMovement.count({ where: { storeId: STORE_ID, referenceId: order.id } }),
        tx.stockReservation.findFirst({ where: { storeId: STORE_ID, orderId: order.id }, select: { id: true } }),
      ]);
      if (movements > 0) fail(`ya movió inventario (${movements} movimientos).`);
      if (reservation) fail("salió de una reserva.");

      const combo = await tx.product.findFirst({
        where: { storeId: STORE_ID, name: COMBO_NAME, isArchived: false },
        select: { id: true, sku: true, name: true, price: true, stock: true, images: { select: { url: true }, orderBy: { createdAt: "asc" }, take: 1 } },
      });
      if (!combo || combo.price !== COMBO_PRICE) fail(`no está el producto «${COMBO_NAME}» a ${COMBO_PRICE}.`);
      if (combo.stock < 1) fail(`«${COMBO_NAME}» no tiene stock.`);
      const brandNames = await getOrderItemBrandNames(tx, [combo.id]);

      const restore = await tx.product.findFirst({
        where: { storeId: STORE_ID, sku: RESTORE_SKU },
        select: {
          id: true, name: true, slug: true, price: true, stock: true, reservedUnits: true, isArchived: true, availableAt: true, productGroupId: true,
          category: { select: { name: true } },
          capsuleEdition: { select: { id: true } },
          images: { where: { brokenAt: null }, select: { id: true } },
          _count: { select: { marketplaceListings: true } },
        },
      });
      if (!restore) fail(`no está ${RESTORE_SKU}.`);
      if (!restore.isArchived) fail(`${RESTORE_SKU} ya no está archivado.`);
      if (restore.price !== RESTORE_PRICE) fail(`${RESTORE_SKU} ya no vale ${RESTORE_PRICE}.`);
      if (restore.stock - restore.reservedUnits < 1) fail(`${RESTORE_SKU} no tiene stock disponible.`);
      if (restore.images.length === 0) fail(`${RESTORE_SKU} no tiene una foto que cargue.`);
      if (restore.capsuleEdition) fail(`${RESTORE_SKU} es el producto de una edición de cápsulas.`);
      if (restore.productGroupId) fail(`${RESTORE_SKU} está en un grupo: se restaura desde Productos con sus variantes.`);
      if (restore._count.marketplaceListings > 0) fail(`${RESTORE_SKU} tiene publicaciones de Mercado Libre.`);
      const prizeDone = await tx.inventoryMovement.findFirst({ where: { storeId: STORE_ID, referenceId: PRIZE_REFERENCE }, select: { id: true } });
      if (prizeDone) fail(`el premio ${PRIZE_REFERENCE} ya está registrado.`);

      const removed = order.orderItems.filter((item) => item.sku !== KEEP_SKU);
      const summary = {
        pedido: ORDER_NUMBER,
        quitar: removed.map((item) => `${item.sku} $${item.price}`),
        agregar: `${combo.sku} «${combo.name}» x1 $${combo.price}`,
        conservar: `${KEEP_SKU} x1 $${KEEP_PRICE}`,
        antes: { subtotal: order.subtotal, descuento: order.discount, tipo: order.discountType, motivo: order.discountReason, total: order.total },
        despues: { subtotal: NEW_SUBTOTAL, descuento: 0, tipo: null, motivo: null, total: NEW_SUBTOTAL + EXPECTED.shippingCost },
        envio: `${order.shipping?.provider} $${order.shipping?.cost} (sin cambio)`,
        inventario: "sin movimientos (pedido PENDIENTE)",
        avisos: "ninguno",
        premio: `${RESTORE_SKU} −1 MANUAL_ADJUSTMENT «${PRIZE_REASON}» · referencia ${PRIZE_REFERENCE} · stock ${restore.stock} → ${restore.stock - 1}`,
        restaurar: `${RESTORE_SKU} «${restore.name}» $${restore.price} · stock al restaurar ${restore.stock - 1} · ${restore.category.name} · ${restore.images.length} foto(s) · /producto/${restore.slug}${restore.availableAt ? ` · disponible desde ${restore.availableAt.toISOString().slice(0, 10)}` : ""}`,
      };
      if (summary.despues.total !== EXPECTED.total) fail("el total nuevo no da $121.700.");
      if (!apply) return { summary, rows: 0 };

      const deleted = await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { in: removed.map((item) => item.id) } } });
      if (deleted.count !== PLACEHOLDER_SKUS.length) fail(`se iban a quitar ${PLACEHOLDER_SKUS.length} líneas y salieron ${deleted.count}.`);
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: combo.id,
          quantity: 1,
          name: combo.name,
          sku: combo.sku,
          price: combo.price,
          imageUrl: combo.images[0]?.url ?? "",
          isCustom: false,
          brandName: orderItemBrandName(brandNames, combo.id),
        },
      });
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING", paidAt: null, updatedAt: order.updatedAt },
        data: { subtotal: NEW_SUBTOTAL, discount: 0, discountType: null, discountReason: null, total: EXPECTED.total },
      });
      if (updated.count !== 1) fail("el pedido cambió mientras se corregía.");
      const prize = await createInventoryMovement(tx, {
        storeId: STORE_ID,
        productId: restore.id,
        type: "MANUAL_ADJUSTMENT",
        quantity: -1,
        reason: PRIZE_REASON,
        description: `Premio de una cápsula del combo x7 de ${ORDER_NUMBER}, anotado por Paula; los otros seis premios esperan las fotos de los papelitos.`,
        referenceId: PRIZE_REFERENCE,
        createdBy: "SYSTEM",
      });
      if (!prize) fail("no se registró el premio.");
      const restored = await tx.product.updateMany({ where: { id: restore.id, storeId: STORE_ID, isArchived: true }, data: { isArchived: false } });
      if (restored.count !== 1) fail(`${RESTORE_SKU} cambió mientras se restauraba.`);
      return { summary, rows: deleted.count + 1 + updated.count + 1 + restored.count };
    });

    console.log(JSON.stringify(plan.summary, null, 1));
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} order-capsule-combo-fix · ${ORDER_NUMBER}: 6 líneas de relleno → «${COMBO_NAME}» $${COMBO_PRICE} + Marcadores ETERNA $${KEEP_PRICE}; descuento $${EXPECTED.discount} FIXED → 0 sin tipo ni motivo; total $${EXPECTED.total} sin cambio; sin inventario, pagos ni avisos · premio ${PRIZE_REFERENCE} −1 (MANUAL_ADJUSTMENT) · ${RESTORE_SKU} restaurado a $${RESTORE_PRICE} · DESHACER editando el pedido en el panel y archivando ${RESTORE_SKU} desde Productos.\n`,
    );
    console.log(`PROD_WRITE_ROWS=${plan.rows}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
