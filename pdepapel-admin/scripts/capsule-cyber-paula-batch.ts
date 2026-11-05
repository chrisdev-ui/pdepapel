/**
 * Pendientes de Paula con las cápsulas Cyber (2026-11-05), para que no los haga a mano. Un paso por pedido o premio,
 * cada uno en su transacción, reanudable (lo hecho se salta) y sin avisos a clientas (no cambia ningún estado).
 *
 * A) ORD-1793834279588-45 («Pedido de live 2»): agrega 1 × Reto de lectura (KIT-SOR-MUL-S-P-4873) a su precio de hoy,
 *    como «Guardar cambios» de la ficha del pedido en PENDIENTE: las líneas se rehacen con su foto de precio/nombre/
 *    SKU/imagen/marca (las que ya estaban conservan la suya), los totales con `calculateOrderTotals` y la reserva
 *    convertida sigue a las líneas con `syncConvertedReservation` (aparta 1 Reto). Canal → WHATSAPP; en la nota
 *    interna «vendido en un live» → «vendido por WhatsApp» y se agrega la línea del Reto verde. Total esperado $59.000.
 * C) ORD-1793835746847-611, ORD-1793835663727-80, ORD-1793835786324-394: canal → WHATSAPP y la misma corrección de la
 *    nota. Sin cambios de líneas ni de reservas.
 * B) Premios de ORD-1793834279588-45, B2) de ORD-1793835746847-611, B3) de ORD-1793835786324-394 y B4) de ORD-1793744962855-67: MANUAL_ADJUSTMENT −1 por `createInventoryMovement`
 *    (el helper de «Ajustar»), motivo «Salió en cápsula · <pedido>», referencia «<pedido>:<SKU>»; acepta archivados.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-cyber-paula-batch.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-cyber-paula-batch.ts --apply --expect new
 *
 * prod-write-models: Order, OrderItem, Product, InventoryMovement, MarketplaceOutboxEvent, StockReservation, StockReservationItem, StockReservationEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import type { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

/** Una sola copia de @prisma/client: la del checkout donde corre (regla de AGENTS.md, 2026-11-04). */
const prismaRuntime = createRequire(`${process.cwd()}/package.json`)("@prisma/client") as typeof import("@prisma/client");

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const UNIT_ID = "d84e61a8-02af-4f58-99a5-c0610b636948";
const ORDER_A = "ORD-1793834279588-45";
const ORDER_B2 = "ORD-1793835746847-611";
const ORDER_B3 = "ORD-1793835786324-394";
const ORDER_B4 = "ORD-1793744962855-67";
/** Antes de registrar sus premios, el pedido tiene que ser de esta clienta (sin tildes ni mayúsculas). */
const PRIZE_OWNERS: Record<string, string> = { [ORDER_B2]: "maria clara", [ORDER_B3]: "laura guarin", [ORDER_B4]: "julieth martinez" };
const RETO_SKU = "KIT-SOR-MUL-S-P-4873";
const RETO_PRICE = 10_000;
const EXPECTED_TOTAL_A = 59_000;
const OLD_PHRASE = "vendido en un live";
const NEW_PHRASE = "vendido por WhatsApp";
const RETO_NOTE = "Reto de lectura: entregar el verde (pedido por la clienta, se cobra).";
const CHANNEL_ORDERS = [ORDER_B2, "ORD-1793835663727-80", "ORD-1793835786324-394"];
/** [pedido, lo que anotó Paula, SKU elegido] */
const PRIZES: [string, string, string][] = [
  [ORDER_A, "rollo de colorear animales marinos", "LIB-ANI-AMA-L-L-551B2C"],
  [ORDER_A, "kit kawaii lila", "KIT-KAW-LIL-S-L-8114"],
  [ORDER_A, "lapicero Intensamente Ennui", "BOL-INT-LIL-S-L-8778"],
  [ORDER_A, "lapicero Halloween araña", "BOL-HAL-NEG-XS-L-5739"],
  [ORDER_A, "notas Stitch", "NOT-STI-PAS-XS-L-5205"],
  [ORDER_A, "agenda A5 Simple Life", "AGE-CIE-ROS-S-P-2661"],
  [ORDER_A, "carpeta hermética verde flores", "CAR-FLO-VER-M-L-5152"],
  [ORDER_B2, "Marcadores Scribe x12", "MAR-CLS-MUL-M-L-8562"],
  [ORDER_B2, "Borrador eléctrico panda", "BOR-OSI-VER-L-P-4965"],
  [ORDER_B2, "Ganchos retro", "CLI-AES-NEG-S-L-2698"],
  [ORDER_B2, "Cuadro de pintar", "KIT-ANI-MUL-M-P-7708"],
  [ORDER_B2, "Llavero peluche Zootopia", "LLA-ANI-MUL-S-L-9099"],
  [ORDER_B2, "Bisturí cactus", "BIS-CAC-AZU-XS-L-1924"],
  [ORDER_B2, "Notas ruleta capibara", "NOT-CAP-MUL-S-L-7892"],
  [ORDER_B3, "Carpeta hermética flores verde", "CAR-FLO-VER-M-L-5152"],
  [ORDER_B3, "Resaltadores Studmark", "RES-CLS-PAS-S-P-2101"],
  [ORDER_B3, "Resaltadores flower neon", "RES-MOD-NEN-S-P-4936"],
  [ORDER_B3, "Cartuchera lovely verde", "CAR-CLS-VER-M-L-4040"],
  [ORDER_B3, "Separadores imantados x4 gatito blanco", "SEP-GAT-BLA-S-L-9863"],
  [ORDER_B3, "Stickers mini Hello Kitty", "STI-HEL-ROJ-XS-L-2809"],
  [ORDER_B3, "Grapadora mini rosada", "HER-MOD-ROS-XS-P-3196"],
  [ORDER_B3, "Kit kawaii amarillo", "KIT-KAW-AMA-S-L-2394"],
  [ORDER_B3, "Espejo Stitch", "ESP-STI-AZU-XS-P-7053"],
  [ORDER_B3, "Llavero Monsters Inc", "LLA-ANI-MUL-S-L-6481"],
  [ORDER_B3, "Vasito kawaii x7 negro", "KIT-KAW-NEG-XS-P-3562"],
  [ORDER_B3, "Notas osos miel", "NOT-OSI-AMA-XS-L-3187"],
  [ORDER_B3, "Bloques de construcción navidad", "LEG-VEG-ROJ-S-L-5037"],
  [ORDER_B3, "Pin gato", "PIN-GAT-MUL-S-L-4354"],
  [ORDER_B3, "Lapicero Intensamente Alegría", "BOL-INT-AMA-S-L-3594"],
  // B4: los 6 que faltaban de ORD-1793744962855-67 (los Bloques de Navidad ya están). Son los mismos SKU que Paula había
  // puesto de relleno en ese pedido antes de que existieran los combos.
  [ORDER_B4, "Folder de bolsillo", "FOL-CLS-AZU-S-P-5584"],
  [ORDER_B4, "Lapiceros pocket x4", "BOL-MOD-BLA-S-L-1317"],
  [ORDER_B4, "Llavero de lujo cute perrito negro", "LLA-PER-NEG-S-P-7598"],
  [ORDER_B4, "Reto de lectura", "KIT-SOR-MUL-S-P-4873"],
  [ORDER_B4, "Lapicero Intensamente Enuui", "BOL-INT-LIL-S-L-8778"],
  [ORDER_B4, "Notas Monet", "NOT-ART-VER-S-L-5447"],
];

const fixNote = (note: string | null) => (note ?? "").replace(OLD_PHRASE, NEW_PHRASE);

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-cyber-paula-batch.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new prismaRuntime.PrismaClient({ transactionOptions: { isolationLevel: prismaRuntime.Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement } = await import("@/lib/inventory");
  const { syncConvertedReservation } = await import("@/lib/stock-reservations");
  const { calculateOrderTotals } = await import("@/lib/order-totals");
  const { getOrderItemBrandNames, orderItemBrandName } = await import("@/lib/order-item-brand");
  const { availableStock } = await import("@/lib/available-stock");
  for (const [name, fn] of Object.entries({ createInventoryMovement, syncConvertedReservation, calculateOrderTotals, getOrderItemBrandNames })) {
    if (typeof fn !== "function") throw new Error(`el checkout principal no tiene ${name}: actualízalo (git pull --ff-only) antes de correr.`);
  }

  const step = async <T>(name: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const started = Date.now();
    try {
      const result = await db.$transaction(run);
      console.log(`paso «${name}»: ok en ${Date.now() - started} ms`);
      return result;
    } catch (error) {
      console.error(`paso «${name}»: FALLÓ en ${Date.now() - started} ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
  const unitCounts = async () => {
    const unit = await db.product.findUniqueOrThrow({ where: { id: UNIT_ID }, select: { stock: true, reservedUnits: true } });
    return { fisicas: unit.stock, apartadas: unit.reservedUnits, libres: availableStock(unit) };
  };

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const unitBefore = await unitCounts();
    console.log(JSON.stringify({ unidadAntes: unitBefore }));

    // ---------- A: plan ----------
    const orderA = await db.order.findFirstOrThrow({
      where: { storeId: STORE_ID, orderNumber: ORDER_A },
      select: {
        id: true, status: true, paidAt: true, subtotal: true, discount: true, couponId: true, couponDiscount: true, total: true, internalNotes: true, salesChannel: true,
        shipping: { select: { cost: true, codFee: true } },
        orderItems: { select: { productId: true, quantity: true, name: true, sku: true, price: true, imageUrl: true, brandName: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const reto = await db.product.findFirstOrThrow({
      where: { storeId: STORE_ID, sku: RETO_SKU },
      select: { id: true, name: true, sku: true, price: true, stock: true, reservedUnits: true, isArchived: true, productGroupId: true, images: { orderBy: { createdAt: "asc" }, take: 1, select: { url: true } }, _count: { select: { offers: true } } },
    });
    const hasReto = orderA.orderItems.some((item) => item.productId === reto.id);
    const aDone = hasReto && orderA.salesChannel === "WHATSAPP" && !(orderA.internalNotes ?? "").includes(OLD_PHRASE) && (orderA.internalNotes ?? "").includes(RETO_NOTE);
    if (!aDone) {
      if (orderA.status !== "PENDING" || orderA.paidAt) throw new Error(`${ORDER_A} ya no está PENDIENTE sin pagar (${orderA.status}).`);
      if (orderA.couponId || orderA.discount || orderA.couponDiscount) throw new Error(`${ORDER_A} tiene descuento o cupón; revísalo a mano.`);
      if (!hasReto && (orderA.orderItems.length !== 1 || orderA.orderItems[0].sku !== "KIT-SOR-MUL-S-L-G9LMLC" || orderA.orderItems[0].quantity !== 1)) throw new Error(`${ORDER_A} ya no es 1 × combo x7.`);
      if (reto.isArchived || reto.productGroupId) throw new Error(`${RETO_SKU} está archivado o en un grupo.`);
      if (reto.price !== RETO_PRICE || reto._count.offers > 0) throw new Error(`${RETO_SKU} no vale $${RETO_PRICE} hoy o tiene una oferta; revisa el precio.`);
      if (!hasReto && availableStock(reto) < 1) throw new Error(`${RETO_SKU} no tiene unidades libres para apartar.`);
    }
    const newNoteA = (() => {
      const fixed = fixNote(orderA.internalNotes);
      return fixed.includes(RETO_NOTE) ? fixed : `${fixed}${fixed ? " " : ""}${RETO_NOTE}`;
    })();
    console.log(JSON.stringify({
      paso: "A", pedido: ORDER_A, estado: aDone ? "ya hecho" : "por hacer",
      lineasAntes: orderA.orderItems.map((item) => `${item.quantity} × ${item.name} (${item.sku}) $${item.price}`),
      lineaNueva: hasReto ? "ya está" : `1 × ${reto.name} (${reto.sku}) $${reto.price} · stock ${reto.stock}, apartadas ${reto.reservedUnits} → ${reto.reservedUnits + 1}`,
      totalAntes: orderA.total, totalNuevo: aDone ? orderA.total : EXPECTED_TOTAL_A,
      canal: `${orderA.salesChannel} → WHATSAPP`, notaAntes: orderA.internalNotes, notaNueva: newNoteA,
      reserva: "la reserva convertida «Pedido de live 2» sigue a las líneas (syncConvertedReservation): +1 Reto de lectura; el x7 no cambia",
    }));

    // ---------- C: plan ----------
    const channelOrders = await db.order.findMany({ where: { storeId: STORE_ID, orderNumber: { in: CHANNEL_ORDERS } }, select: { id: true, orderNumber: true, status: true, salesChannel: true, internalNotes: true } });
    if (channelOrders.length !== CHANNEL_ORDERS.length) throw new Error(`se esperaban ${CHANNEL_ORDERS.length} pedidos para el canal y hay ${channelOrders.length}.`);
    const cPlan = channelOrders.map((o) => ({ ...o, done: o.salesChannel === "WHATSAPP" && !(o.internalNotes ?? "").includes(OLD_PHRASE), newNote: fixNote(o.internalNotes) }));
    for (const o of cPlan) console.log(JSON.stringify({ paso: "C", pedido: o.orderNumber, estadoPedido: o.status, estado: o.done ? "ya hecho" : "por hacer", canal: `${o.salesChannel} → WHATSAPP`, notaAntes: o.internalNotes, notaNueva: o.newNote }));

    // ---------- B / B2: plan ----------
    for (const [orderNumber, owner] of Object.entries(PRIZE_OWNERS)) {
      const o = await db.order.findFirstOrThrow({ where: { storeId: STORE_ID, orderNumber }, select: { fullName: true } });
      const name = (o.fullName ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!name.startsWith(owner)) throw new Error(`${orderNumber} no es de «${owner}»; no se registran sus premios.`);
    }
    const prizeRows = [];
    const planned = new Map<string, number>();
    const tooLow: string[] = [];
    for (const [orderNumber, said, sku] of PRIZES) {
      const product = await db.product.findFirstOrThrow({ where: { storeId: STORE_ID, sku }, select: { id: true, name: true, sku: true, stock: true, reservedUnits: true, isArchived: true, isKit: true, price: true } });
      if (product.isKit) throw new Error(`${sku} es un kit: un premio se descuenta del producto físico.`);
      const reference = `${orderNumber}:${sku}`;
      const done = await db.inventoryMovement.findFirst({ where: { storeId: STORE_ID, referenceId: reference }, select: { id: true } });
      const before = product.stock - (planned.get(sku) ?? 0);
      if (!done) {
        // Todo el lote junto: lo que ya descontaron otros premios de esta corrida, lo apartado hoy y el Reto que aparta A.
        const heldByA = sku === RETO_SKU && !hasReto ? 1 : 0;
        if (before - 1 < product.reservedUnits + heldByA) {
          tooLow.push(`${sku} (${said}, ${orderNumber}): stock ${before} − 1 quedaría por debajo de lo apartado (${product.reservedUnits + heldByA})`);
        }
        planned.set(sku, (planned.get(sku) ?? 0) + 1);
      }
      prizeRows.push({ orderNumber, said, product, reference, done: Boolean(done) });
      const stepName = orderNumber === ORDER_A ? "B" : orderNumber === ORDER_B2 ? "B2" : orderNumber === ORDER_B3 ? "B3" : "B4";
      console.log(JSON.stringify({ paso: stepName, pedido: orderNumber, premio: said, sku, producto: product.name, precio: product.price, archivado: product.isArchived, stock: `${before} → ${done ? before : before - 1}`, referencia: reference, estado: done ? "ya registrado" : "por registrar" }));
    }
    if (tooLow.length > 0) throw new Error(`premios que dejarían el stock por debajo de 0 (no se escribe nada): ${tooLow.join("; ")}`);

    const pendingA = aDone ? 0 : 1;
    const pendingC = cPlan.filter((o) => !o.done).length;
    const pendingPrizes = prizeRows.filter((row) => !row.done).length;
    console.log(`Resumen: A ${pendingA} pedido · C ${pendingC} pedidos · premios ${pendingPrizes} (B ${prizeRows.filter((r) => !r.done && r.orderNumber === ORDER_A).length}, B2 ${prizeRows.filter((r) => !r.done && r.orderNumber === ORDER_B2).length}, B3 ${prizeRows.filter((r) => !r.done && r.orderNumber === ORDER_B3).length}, B4 ${prizeRows.filter((r) => !r.done && r.orderNumber === ORDER_B4).length})`);
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    let rows = 0;
    // ---------- A ----------
    if (!aDone) {
      await step(`A ${ORDER_A}`, async (tx) => {
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderA.id }, select: { status: true, paidAt: true, total: true, orderItems: { select: { productId: true }, orderBy: { createdAt: "asc" } } } });
        if (fresh.status !== "PENDING" || fresh.paidAt || fresh.total !== orderA.total) throw new Error(`${ORDER_A} cambió; no se escribió nada.`);
        const kept = orderA.orderItems.filter((item) => item.productId !== reto.id);
        const lines = [
          ...kept.map((item) => ({ productId: item.productId, quantity: item.quantity, name: item.name, sku: item.sku, price: item.price, imageUrl: item.imageUrl ?? "", brandName: item.brandName })),
          { productId: reto.id, quantity: 1, name: reto.name, sku: reto.sku, price: reto.price, imageUrl: reto.images[0]?.url ?? "", brandName: undefined as string | null | undefined },
        ];
        const brandNames = await getOrderItemBrandNames(tx, [reto.id]);
        const totals = calculateOrderTotals(lines.map((line) => ({ product: { price: line.price }, quantity: line.quantity })), { shippingCost: Number(orderA.shipping?.cost ?? 0), codFee: orderA.shipping?.codFee ?? null });
        if (totals.total !== EXPECTED_TOTAL_A) throw new Error(`el total daría $${totals.total}, no $${EXPECTED_TOTAL_A}; no se escribió nada.`);
        await tx.orderItem.deleteMany({ where: { orderId: orderA.id } });
        for (const line of lines) {
          await tx.orderItem.create({
            data: {
              orderId: orderA.id, productId: line.productId, quantity: line.quantity, name: line.name, sku: line.sku, price: line.price, imageUrl: line.imageUrl, isCustom: false,
              brandName: line.brandName === undefined ? orderItemBrandName(brandNames, line.productId) : line.brandName,
            },
          });
        }
        await syncConvertedReservation(tx, { storeId: STORE_ID, orderId: orderA.id, lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), actor: "SYSTEM" });
        await tx.order.update({
          where: { id: orderA.id },
          data: { subtotal: totals.subtotal, discount: totals.discount, discountType: null, discountReason: null, total: totals.total, internalNotes: newNoteA, salesChannel: "WHATSAPP" },
        });
      });
      rows += 1;
    }
    // ---------- C ----------
    for (const o of cPlan.filter((item) => !item.done)) {
      await step(`C ${o.orderNumber}`, async (tx) => {
        const updated = await tx.order.updateMany({ where: { id: o.id, internalNotes: o.internalNotes, salesChannel: o.salesChannel }, data: { salesChannel: "WHATSAPP", internalNotes: o.newNote } });
        if (updated.count !== 1) throw new Error(`${o.orderNumber} cambió; no se escribió nada.`);
      });
      rows += 1;
    }
    // ---------- B / B2 ----------
    for (const row of prizeRows.filter((item) => !item.done)) {
      await step(`premio ${row.reference}`, async (tx) => {
        const again = await tx.inventoryMovement.findFirst({ where: { storeId: STORE_ID, referenceId: row.reference }, select: { id: true } });
        if (again) return;
        await createInventoryMovement(tx, {
          storeId: STORE_ID,
          productId: row.product.id,
          type: "MANUAL_ADJUSTMENT",
          quantity: -1,
          reason: `Salió en cápsula · ${row.orderNumber}${row.product.isArchived ? " (producto estaba archivado)" : ""}`,
          description: `Premio de una cápsula de ${row.orderNumber}, anotado por Paula: «${row.said}».`,
          referenceId: row.reference,
          createdBy: "SYSTEM",
        });
      });
      rows += 1;
    }

    const unitAfter = await unitCounts();
    console.log(JSON.stringify({ unidadAntes: unitBefore, unidadDespues: unitAfter }));
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} capsule-cyber-paula-batch · A ${ORDER_A}: +1 Reto de lectura ($${RETO_PRICE}, total $${EXPECTED_TOTAL_A}, reserva convertida +1 Reto), canal WHATSAPP y nota · C ${CHANNEL_ORDERS.join(", ")}: canal WHATSAPP y nota · premios: ${pendingPrizes} MANUAL_ADJUSTMENT −1 «Salió en cápsula» (${ORDER_A}, ${ORDER_B2}, ${ORDER_B3} y ${ORDER_B4}) · unidad ${unitBefore.libres} libres antes, ${unitAfter.libres} después · DESHACER: la línea del Reto se quita desde el pedido; los premios con un ajuste +1 desde el kardex.\n`,
    );
    console.log(`PROD_WRITE_ROWS=${rows}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  const code = (error as { code?: string }).code;
  console.error(`ERROR${code ? ` ${code}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
