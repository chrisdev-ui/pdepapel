/**
 * Guías hechas en envioclick.com cuyo número Paula ya escribió a mano en un
 * pedido (antes de la adopción automática, 2026-10-28): se adoptan SIN AVISAR.
 * Mismo núcleo que el panel (`adoptOrphanGuide`): proveedor EnvioClick + id
 * de la guía, estado solo hacia adelante, eventos al seguimiento y avisos
 * huérfanos cerrados como vinculados. A la clienta no le sale nada: el hito
 * queda reclamado como «Omitido» (correo y WhatsApp), y este guion no llama
 * al envío de correos ni de WhatsApp.
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/adopt-orphan-guides-silent.ts
 * Escritura (después del despliegue del código, con el token de Christian):
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/adopt-orphan-guides-silent.ts --apply --expect new
 * Con `--orders=ORD-a,ORD-b` solo esos pedidos (aborta si alguno no coincide).
 *
 * Antes de escribir anota en `ops/prod-writes.log` las líneas DESHACER de cada
 * pedido. Una adopción que movería inventario se deshace sola (no es para un
 * respaldo en silencio). Idempotente: una guía adoptada ya no está sin pedido.
 */
import "./lib/allow-server-only.cjs";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { NotificationChannel, OrderNotificationStatus, PrismaClient, type Prisma } from "@prisma/client";

import { adoptOrphanGuide, findManualShippingByTracking, findOrphanGuideByTracking, listOrphanGuides, ORPHAN_REASON } from "@/lib/orphan-guides";
import { milestoneForStatus } from "@/lib/shipment-milestones";
import { buildDedupeKey, SILENT_NOTICE_REASON } from "@/lib/shipment-notification-keys";

import { createProdClient } from "./lib/prod-client.mjs";

const RESOLVED_BY = "script:adopt-orphan-guides-silent";
const sql = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

interface Match {
  storeId: string;
  idOrder: string;
  trackingCode: string;
  orderId: string;
  orderNumber: string;
  shippingId: string;
  orderStatus: string;
  shipping: { status: string; provider: string; carrierName: string | null; courier: string | null; trackingCode: string | null };
  guideStatus: string;
  eventIds: string[];
}

async function findMatches(db: PrismaClient): Promise<Match[]> {
  const stores = await db.shippingWebhookEvent.findMany({
    where: { reason: ORPHAN_REASON, resolvedAt: null, storeId: { not: null } },
    distinct: ["storeId"],
    select: { storeId: true },
  });
  const matches: Match[] = [];
  for (const { storeId } of stores) {
    for (const guide of await listOrphanGuides(db, storeId as string)) {
      if (!guide.trackingCode) continue;
      // Las dos guardas del panel: un solo envío manual con ese número y una sola guía con ese número.
      const shipping = await findManualShippingByTracking(db, { storeId: storeId as string, trackingCode: guide.trackingCode });
      const sameGuide = await findOrphanGuideByTracking(db, { storeId: storeId as string, trackingCode: guide.trackingCode });
      if (!shipping || sameGuide?.idOrder !== guide.idOrder) continue;
      const row = await db.shipping.findUniqueOrThrow({
        where: { id: shipping.shippingId },
        select: { status: true, provider: true, carrierName: true, courier: true, trackingCode: true, order: { select: { orderNumber: true, status: true } } },
      });
      matches.push({
        storeId: storeId as string,
        idOrder: guide.idOrder,
        trackingCode: guide.trackingCode,
        orderId: shipping.orderId,
        orderNumber: row.order.orderNumber,
        shippingId: shipping.shippingId,
        orderStatus: row.order.status,
        shipping: { status: row.status, provider: row.provider, carrierName: row.carrierName, courier: row.courier, trackingCode: row.trackingCode },
        guideStatus: guide.status,
        eventIds: sameGuide.events.map((event) => event.id),
      });
    }
  }
  return matches;
}

/** El hito queda reclamado para la clienta como «Omitido»: un aviso posterior del mismo hito no le escribe. */
async function claimSilent(tx: Prisma.TransactionClient, match: Match, milestone: NonNullable<ReturnType<typeof milestoneForStatus>>, at: Date) {
  const keys: string[] = [];
  for (const channel of [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP]) {
    const dedupeKey = buildDedupeKey({ shippingId: match.shippingId, milestone, trackingCode: match.shipping.trackingCode, channel, role: "customer" });
    const exists = await tx.orderNotification.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (exists) continue;
    await tx.orderNotification.create({
      data: {
        storeId: match.storeId,
        orderId: match.orderId,
        shippingId: match.shippingId,
        milestone,
        channel,
        role: "customer",
        dedupeKey,
        status: OrderNotificationStatus.SKIPPED,
        reason: SILENT_NOTICE_REASON,
        trackingCode: match.shipping.trackingCode,
        createdBy: RESOLVED_BY,
        createdAt: at,
      },
    });
    keys.push(dedupeKey);
  }
  return keys;
}

function undoLines(match: Match, milestoneKeys: string[], at: string): string[] {
  return [
    `UPDATE \`Shipping\` SET provider = ${sql(match.shipping.provider)}, envioClickIdOrder = NULL, status = ${sql(match.shipping.status)}, carrierName = ${sql(match.shipping.carrierName)}, courier = ${sql(match.shipping.courier)} WHERE id = ${sql(match.shippingId)};`,
    `UPDATE \`Order\` SET status = ${sql(match.orderStatus)} WHERE id = ${sql(match.orderId)};`,
    `UPDATE \`ShippingWebhookEvent\` SET resolvedAt = NULL, resolvedBy = NULL, resolution = NULL, linkedOrderId = NULL WHERE id IN (${match.eventIds.map(sql).join(", ")});`,
    `DELETE FROM \`ShippingTrackingEvent\` WHERE shippingId = ${sql(match.shippingId)} AND createdAt >= ${sql(at.replace("T", " ").replace("Z", ""))};`,
    ...(milestoneKeys.length ? [`DELETE FROM \`OrderNotification\` WHERE dedupeKey IN (${milestoneKeys.map(sql).join(", ")});`] : []),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/adopt-orphan-guides-silent.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    // --orders A,B: solo esos pedidos (un caso dudoso se deja como guía sin pedido).
    const ordersArg = args.find((arg) => arg.startsWith("--orders="))?.slice("--orders=".length);
    const only = ordersArg ? new Set(ordersArg.split(",").map((order) => order.trim()).filter(Boolean)) : null;
    const allMatches = await findMatches(db);
    if (only) {
      const missing = Array.from(only).filter((order) => !allMatches.some((match) => match.orderNumber === order));
      if (missing.length > 0) throw new Error(`no están entre las coincidencias: ${missing.join(", ")}`);
    }
    const matches = only ? allMatches.filter((match) => only.has(match.orderNumber)) : allMatches;
    if (only) console.log(`Solo ${matches.length} de ${allMatches.length} (--orders); quedan sin tocar: ${allMatches.filter((match) => !only.has(match.orderNumber)).map((match) => match.orderNumber).join(", ") || "ninguno"}.`);
    console.log(`${apply ? "APLICAR" : "ENSAYO"}: ${matches.length} pedido(s) con el número de una guía sin pedido.`);
    for (const m of matches) {
      console.log(`  ${m.orderNumber} ← guía ${m.idOrder} (${m.trackingCode}) · envío ${m.shipping.status} → ${m.guideStatus} · pedido ${m.orderStatus}`);
    }
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    let written = 0;
    for (const match of matches) {
      const at = new Date();
      const milestone = milestoneForStatus(match.guideStatus as Parameters<typeof milestoneForStatus>[0]);
      const keys = milestone
        ? [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP].map((channel) => buildDedupeKey({ shippingId: match.shippingId, milestone, trackingCode: match.shipping.trackingCode, channel, role: "customer" }))
        : [];
      appendFileSync(
        resolve(process.cwd(), "ops/prod-writes.log"),
        [...undoLines(match, keys, at.toISOString()).map((line) => `# ${at.toISOString()} adopt-orphan-guides-silent ${match.orderNumber} DESHACER ${line}`), ""].join("\n"),
      );
      await db.$transaction(async (tx) => {
        const events = await tx.shippingWebhookEvent.findMany({ where: { id: { in: match.eventIds }, resolvedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, idOrder: true, payload: true } });
        if (events.length === 0) throw new Error(`la guía ${match.idOrder} ya no está sin pedido`);
        const adopted = await adoptOrphanGuide(tx, { storeId: match.storeId, orderId: match.orderId, shippingId: match.shippingId, idOrder: match.idOrder, events, resolvedBy: RESOLVED_BY });
        if (adopted.stockProductIds.length > 0) throw new Error(`${match.orderNumber}: la adopción movería inventario; se deshace y queda para hacerlo desde el panel`);
        const finalMilestone = milestoneForStatus(adopted.status);
        if (finalMilestone) await claimSilent(tx, match, finalMilestone, at);
        console.log(`  ✓ ${match.orderNumber}: ${adopted.previousStatus} → ${adopted.status}, sin avisar.`);
      }, { maxWait: 15_000, timeout: 120_000 }); // Desde fuera de Railway cada consulta tarda; los 5 s por defecto no alcanzan para copiar los eventos.
      written += 1;
    }
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
