/**
 * Edición Cyber, un solo contador (2026-11-04): los 8 combos «Cápsula sorpresa Cyber xN» pasan a ser kits de N
 * unidades de «Cápsula Cyber (unidad)», un producto interno archivado de «Kits sorpresa» (`isInternalCapsuleUnit`).
 * Así la tienda, los lives y WhatsApp descuentan de la misma urna y cada combo muestra floor(disponibles / N).
 *
 * Pasos, en este orden (una reserva de un kit aparta su componente, así que los combos tienen que ser kits antes):
 * 1. Crea la unidad (archivada, $5.800, costo $5.107) con INITIAL_INTAKE = Σ(stock × N) de los combos hoy (272).
 * 2. Une cada combo a la unidad (`ProductKit`, N), lo marca kit y cuadra su stock con `settleKitStock` (movimiento
 *    «Conversión a kit» en su kardex: el x5 pasa de 8 a 54, y así cada uno).
 * 3. Aparta el pedido pendiente ORD-1793744962855-67 (x7 × 1) como lo hace ahora el panel al crear un pedido de
 *    cápsulas: reserva CONVERTIDA atada al pedido, 7 días (`holdPanelOrderLines`).
 * 4. Cuatro reservas ACTIVAS «Pedido de live 1–4» (x7, x7, x10, x15), 7 días, por `createReservation` (lo mismo que
 *    «Reservar» en el panel). Paula las pasa a pedido con «Convertir en pedido» y completa los datos; las que no se
 *    conviertan vencen y sus cápsulas vuelven a la venta.
 * Resultado: unidad 272 físicas, 46 apartadas, 226 a la venta.
 *
 * Reanudable: cada paso mira si ya está hecho (unidad por nombre, combos ya kit, reserva del pedido, reservas por nombre).
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-cyber-shared-unit.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-cyber-shared-unit.ts --apply --expect new
 *
 * prod-write-models: Product, ProductKit, InventoryMovement, MarketplaceOutboxEvent, StockReservation, StockReservationItem, StockReservationEvent
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const CAPSULE_CATEGORY_ID = "9bdebb9f-8a23-4bed-a8a4-8e6de8b58f47";
const UNIT_NAME = "Cápsula Cyber (unidad)";
const UNIT_PRICE = 5_800;
const UNIT_COST = 5_107;
const ORDER_NUMBER = "ORD-1793744962855-67";
const HOLD_DAYS = 7;
/** [SKU, cápsulas, stock esperado hoy] tras capsule-combos-cyber (104d51a1). */
const COMBOS: [string, number, number][] = [
  ["KIT-SOR-MUL-S-L-5R5PCN", 5, 8],
  ["KIT-SOR-MUL-S-L-DXYIFC", 6, 6],
  ["KIT-SOR-MUL-S-L-G9LMLC", 7, 9],
  ["KIT-SOR-MUL-S-L-IH6QO7", 8, 3],
  ["KIT-SOR-MUL-S-L-5H4AJ7", 9, 3],
  ["KIT-SOR-MUL-S-L-8G27HZ", 10, 4],
  ["KIT-SOR-MUL-S-L-XNM44P", 12, 1],
  ["KIT-SOR-MUL-S-L-IQ0Y5K", 15, 2],
];
/** Pedidos vendidos en lives que Paula va a registrar: [nombre, cápsulas del combo]. */
const LIVE_ORDERS: [string, number][] = [
  ["Pedido de live 1", 7],
  ["Pedido de live 2", 7],
  ["Pedido de live 3", 10],
  ["Pedido de live 4", 15],
];

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-cyber-shared-unit.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement, recalculateKitStock } = await import("@/lib/inventory");
  const { settleKitStock, KIT_CONVERSION_REASON } = await import("@/lib/product-kit-conversion");
  const { holdPanelOrderLines, createReservation } = await import("@/lib/stock-reservations");
  const { generateSemanticSKU } = await import("@/lib/variant-generator");
  const { getUniqueProductSlug } = await import("@/lib/product-slugs");
  const { generateProductSlug } = await import("@/lib/slugify");
  const { normalizeProductIdentifiers } = await import("@/lib/product-identifiers");
  const { availableStock } = await import("@/lib/available-stock");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const combos = await db.product.findMany({
      where: { storeId: STORE_ID, sku: { in: COMBOS.map(([sku]) => sku) } },
      select: { id: true, sku: true, name: true, stock: true, reservedUnits: true, isKit: true, isArchived: true, categoryId: true, designId: true, colorId: true, sizeId: true, kitComponents: { select: { componentId: true, quantity: true } } },
    });
    if (combos.length !== COMBOS.length) throw new Error(`se esperaban ${COMBOS.length} combos y hay ${combos.length}.`);
    const existingUnit = await db.product.findFirst({ where: { storeId: STORE_ID, name: UNIT_NAME }, select: { id: true, stock: true, reservedUnits: true, isArchived: true, categoryId: true } });
    if (existingUnit && (!existingUnit.isArchived || existingUnit.categoryId !== CAPSULE_CATEGORY_ID)) throw new Error(`«${UNIT_NAME}» existe pero no está archivada en «Kits sorpresa».`);

    const rows = COMBOS.map(([sku, n, expected]) => {
      const combo = combos.find((row) => row.sku === sku)!;
      if (combo.categoryId !== CAPSULE_CATEGORY_ID || combo.isArchived) throw new Error(`${sku} no es un combo vivo de «Kits sorpresa».`);
      if (!combo.name.startsWith("Cápsula sorpresa Cyber x")) throw new Error(`${sku} no es un combo Cyber («${combo.name}»).`);
      const linked = combo.isKit && combo.kitComponents.length === 1 && combo.kitComponents[0].componentId === existingUnit?.id && combo.kitComponents[0].quantity === n;
      if (combo.isKit && !linked) throw new Error(`${sku} ya es kit de otra cosa.`);
      if (!combo.isKit && combo.stock !== expected) throw new Error(`${sku}: stock ${combo.stock}, se esperaba ${expected}; no se escribió nada.`);
      if (!combo.isKit && combo.reservedUnits !== 0) throw new Error(`${sku} tiene ${combo.reservedUnits} apartadas.`);
      return { ...combo, n, linked };
    });
    const pool = rows.filter((row) => !row.linked).reduce((sum, row) => sum + row.stock * row.n, 0);
    const unitIntake = existingUnit ? 0 : pool;
    if (!existingUnit && pool !== 272) throw new Error(`Σ(stock × N) = ${pool}, se esperaba 272; no se escribió nada.`);

    const order = await db.order.findFirstOrThrow({
      where: { storeId: STORE_ID, orderNumber: ORDER_NUMBER },
      select: { id: true, status: true, fullName: true, phone: true, orderNumber: true, orderItems: { select: { productId: true, quantity: true } } },
    });
    const x7 = rows.find((row) => row.n === 7)!;
    const orderLines = order.orderItems.filter((item) => rows.some((row) => row.id === item.productId)).map((item) => ({ productId: item.productId!, quantity: item.quantity }));
    if (order.status !== "PENDING") throw new Error(`${ORDER_NUMBER} ya no está PENDIENTE (${order.status}).`);
    if (orderLines.length !== 1 || orderLines[0].productId !== x7.id || orderLines[0].quantity !== 1) throw new Error(`${ORDER_NUMBER} ya no tiene una sola línea x7 × 1.`);
    const orderHold = await db.stockReservation.findFirst({ where: { storeId: STORE_ID, orderId: order.id, status: { in: ["ACTIVE", "CONVERTED"] } }, select: { id: true } });
    const liveHolds = await db.stockReservation.findMany({ where: { storeId: STORE_ID, customerName: { in: LIVE_ORDERS.map(([name]) => name) }, status: { in: ["ACTIVE", "CONVERTED"] } }, select: { customerName: true } });
    const liveDone = new Set(liveHolds.map((row) => row.customerName));

    const held = 7 + LIVE_ORDERS.reduce((sum, [, n]) => sum + n, 0);
    const unitPhysical = (existingUnit?.stock ?? 0) + unitIntake;
    const forSale = unitPhysical - held;
    const plan = {
      unidad: existingUnit ? `ya existe (stock ${existingUnit.stock})` : `crear «${UNIT_NAME}» archivada en Kits sorpresa, $${UNIT_PRICE}, costo $${UNIT_COST}, INITIAL_INTAKE ${unitIntake}`,
      combos: rows.map((row) => ({ sku: row.sku, combo: `x${row.n}`, estado: row.linked ? "ya es kit" : "pasa a kit", stockHoy: row.stock, stockKit: Math.floor(unitPhysical / row.n), disponibleTrasApartar: Math.floor(forSale / row.n) })),
      reservaPedido: orderHold ? "ya apartado" : `${ORDER_NUMBER}: CONVERTIDA, x7 × 1 = 7 cápsulas, ${HOLD_DAYS} días`,
      reservasLive: LIVE_ORDERS.map(([name, n]) => `${name}: x${n} × 1 = ${n} cápsulas, ACTIVA ${HOLD_DAYS} días · ${liveDone.has(name) ? "ya existe" : "por crear"}`),
      resultado: { fisicas: unitPhysical, apartadas: held, aLaVenta: forSale },
    };
    console.log(JSON.stringify(plan, null, 1));
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    // Pasos cortos, cada uno en su transacción y reanudable: la primera corrida (2026-11-04 19:58Z) hizo todo en una sola
    // transacción Serializable contra Railway y falló sin escribir nada. Cada paso se mide y se reintenta si choca.
    const step = async <T>(name: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        const started = Date.now();
        try {
          const result = await db.$transaction(run);
          console.log(`paso «${name}»: ok en ${Date.now() - started} ms`);
          return result;
        } catch (error) {
          const code = (error as { code?: string }).code;
          console.error(`paso «${name}»: intento ${attempt} falló en ${Date.now() - started} ms (${code ?? "sin código"}): ${error instanceof Error ? error.message : String(error)}`);
          if (attempt >= 3 || (code !== "P2034" && code !== "P2028")) throw error;
        }
      }
    };

    const unitId = await step("unidad", async (tx) => {
      let id = existingUnit?.id;
      if (!id) {
        const sample = rows[0];
        const [category, design, color, size] = await Promise.all([
          tx.category.findUniqueOrThrow({ where: { id: CAPSULE_CATEGORY_ID }, select: { name: true } }),
          tx.design.findUniqueOrThrow({ where: { id: sample.designId }, select: { name: true } }),
          tx.color.findUniqueOrThrow({ where: { id: sample.colorId }, select: { name: true } }),
          tx.size.findUniqueOrThrow({ where: { id: sample.sizeId }, select: { name: true, value: true } }),
        ]);
        let sku = generateSemanticSKU(category.name, design.name, color.name, size.value || size.name);
        for (let i = 0; i < 5 && (await tx.product.findUnique({ where: { sku }, select: { id: true } })); i++) sku = generateSemanticSKU(category.name, design.name, color.name, size.value || size.name);
        const slug = await getUniqueProductSlug(tx, { storeId: STORE_ID, baseSlug: generateProductSlug({ name: UNIT_NAME }) });
        const unit = await tx.product.create({
          data: {
            storeId: STORE_ID, name: UNIT_NAME, slug, sku, price: UNIT_PRICE, acqPrice: UNIT_COST, stock: 0, isArchived: true,
            description: "<p>Unidad interna de la urna de Edición Cyber: los combos «Cápsula sorpresa Cyber xN» descuentan de aquí. No se vende sola.</p>",
            categoryId: CAPSULE_CATEGORY_ID, designId: sample.designId, colorId: sample.colorId, sizeId: sample.sizeId,
            ...normalizeProductIdentifiers({ hasNoProductIdentifier: true, defaultNoIdentifierWhenEmpty: true }),
          },
          select: { id: true },
        });
        id = unit.id;
        await createInventoryMovement(tx, {
          storeId: STORE_ID, productId: id, type: "INITIAL_INTAKE", quantity: unitIntake,
          reason: "Inventario inicial al crear producto",
          description: `Edición Cyber: las cápsulas de la urna que estaban repartidas en los 8 combos (Σ stock × N = ${unitIntake}), ahora en un solo contador.`,
          cost: UNIT_COST, createdBy: "SYSTEM",
        });
      }
      return id as string;
    });

    // Los 8 combos juntos: si quedara uno a medias, ese combo y la unidad venderían las mismas cápsulas.
    await step("combos a kit", async (tx) => {
      for (const row of rows.filter((item) => !item.linked)) {
        await tx.productKit.create({ data: { kitId: row.id, componentId: unitId, quantity: row.n } });
        await tx.product.update({ where: { id: row.id }, data: { isKit: true } });
        await settleKitStock(tx, { storeId: STORE_ID, productId: row.id, reason: KIT_CONVERSION_REASON, createdBy: "SYSTEM" });
      }
      await recalculateKitStock(tx, rows.map((row) => row.id));
    });

    if (!orderHold) {
      await step(`apartado ${ORDER_NUMBER}`, (tx) =>
        holdPanelOrderLines(tx, { storeId: STORE_ID, orderId: order.id, orderNumber: order.orderNumber, customerName: order.fullName, customerPhone: order.phone, lines: orderLines, createdBy: "SYSTEM" }),
      );
    }

    for (const [name, n] of LIVE_ORDERS) {
      if (liveDone.has(name)) continue;
      const combo = rows.find((row) => row.n === n)!;
      const started = Date.now();
      await createReservation({ storeId: STORE_ID, items: [{ productId: combo.id, quantity: 1 }], customerName: name, note: `Combo x${n} vendido en un live; Paula lo registra con «Convertir en pedido».`, days: HOLD_DAYS, createdBy: "SYSTEM" });
      console.log(`paso «${name}»: ok en ${Date.now() - started} ms`);
    }

    const unit = await db.product.findUniqueOrThrow({ where: { id: unitId }, select: { stock: true, reservedUnits: true } });
    const after = await db.product.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: { sku: true, stock: true, reservedUnits: true } });
    console.log(JSON.stringify({ unidad: { id: unitId, ...unit, aLaVenta: availableStock(unit) }, combos: after.map((row) => ({ sku: row.sku, disponible: availableStock(row) })) }, null, 1));
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} capsule-cyber-shared-unit · «${UNIT_NAME}» (${unitId}) archivada en Kits sorpresa con ${unit.stock} cápsulas; los 8 combos Cyber pasan a kits de N unidades; ${ORDER_NUMBER} apartado (x7) y 4 reservas «Pedido de live 1–4» (x7, x7, x10, x15, ${HOLD_DAYS} días) · apartadas ${unit.reservedUnits}, a la venta ${availableStock(unit)} · DESHACER: quitar el kit de cada combo desde su ficha y liberar las reservas desde Reservas.\n`,
    );
    console.log("PROD_WRITE_ROWS=1");
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  const code = (error as { code?: string }).code;
  console.error(`ERROR${code ? ` ${code}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
