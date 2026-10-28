/**
 * Eventos de seguimiento ajenos pegados a pedidos sin guía de EnvioClick.
 *
 * Antes del 2026-09-10 el webhook de EnvioClick buscaba el envío con
 * `{ myShipmentReference: undefined }`, que Prisma trata como «sin condición»:
 * los avisos de guías hechas fuera del panel cayeron en el primer envío que
 * devolvía la base (ORD-…-765 de diciembre a marzo, ORD-…-556 de marzo a
 * septiembre), con varios ciclos completos de entrega, y el webhook también
 * reescribía su número de guía y sus fechas.
 *
 * Este guion borra esos eventos y deja en NULL el número de guía y las fechas
 * (recogida, estimada, entrega) que escribieron los avisos ajenos. No toca el
 * estado del envío, la transportadora ni el pedido: el estado real de esos
 * pedidos no se conoce y lo decide Christian aparte.
 *
 * Solo envíos MANUAL sin `envioClickIdOrder` con más de un ciclo de entrega
 * (más de un «Entregado» o más de 2 «Pendiente de recolección»), y solo los
 * pedidos de `--orders=` (aborta si alguno no está entre los detectados).
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/clean-foreign-tracking-events.ts --orders=ORD-1773361457128-556,ORD-1764956486294-765
 * Escritura (con el token de Christian):
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/clean-foreign-tracking-events.ts --apply --expect new --orders=ORD-…
 * Deshacer (con otro token):
 *   npm run prod:write -- scripts/clean-foreign-tracking-events.ts --undo=output/backups/<archivo>.json --expect new
 *
 * Antes de escribir guarda en `output/backups/` (fuera de Git: las
 * descripciones pueden traer el nombre de quien recibió) todas las filas
 * borradas y los valores anteriores, y anota en `ops/prod-writes.log` solo la
 * ruta del respaldo y los conteos.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

interface Target {
  orderNumber: string;
  shippingId: string;
  trackingCode: string | null;
  pickupDate: Date | null;
  estimatedDeliveryDate: Date | null;
  actualDeliveryDate: Date | null;
  events: number;
  delivered: number;
  pickups: number;
  firstTs: Date;
  lastTs: Date;
}

interface Backup {
  createdAt: string;
  shippings: Array<Omit<Target, "events" | "delivered" | "pickups" | "firstTs" | "lastTs">>;
  events: Array<{ id: string; shippingId: string; status: string; description: string; location: string | null; timestamp: string; createdAt: string }>;
}

async function findTargets(db: PrismaClient): Promise<Target[]> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT o.orderNumber, s.id shippingId, s.trackingCode, s.pickupDate, s.estimatedDeliveryDate, s.actualDeliveryDate,
      COUNT(*) events,
      SUM(t.status IN ('Entregado','Entregada','Delivered')) delivered,
      SUM(t.status LIKE 'Pendiente de Recolecci%') pickups,
      MIN(t.timestamp) firstTs, MAX(t.timestamp) lastTs
    FROM ShippingTrackingEvent t
    JOIN Shipping s ON s.id = t.shippingId
    JOIN \`Order\` o ON o.id = s.orderId
    WHERE s.provider = 'MANUAL' AND s.envioClickIdOrder IS NULL
    GROUP BY s.id
    HAVING delivered > 1 OR pickups > 2
    ORDER BY events DESC`);
  return rows.map((row) => ({
    orderNumber: String(row.orderNumber),
    shippingId: String(row.shippingId),
    trackingCode: (row.trackingCode as string | null) ?? null,
    pickupDate: (row.pickupDate as Date | null) ?? null,
    estimatedDeliveryDate: (row.estimatedDeliveryDate as Date | null) ?? null,
    actualDeliveryDate: (row.actualDeliveryDate as Date | null) ?? null,
    events: Number(row.events),
    delivered: Number(row.delivered),
    pickups: Number(row.pickups),
    firstTs: row.firstTs as Date,
    lastTs: row.lastTs as Date,
  }));
}

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "—");

async function undo(db: PrismaClient, file: string) {
  const backup = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as Backup;
  await db.$transaction(
    async (tx) => {
      for (const shipping of backup.shippings) {
        await tx.shipping.update({
          where: { id: shipping.shippingId },
          data: {
            trackingCode: shipping.trackingCode,
            pickupDate: shipping.pickupDate ? new Date(shipping.pickupDate) : null,
            estimatedDeliveryDate: shipping.estimatedDeliveryDate ? new Date(shipping.estimatedDeliveryDate) : null,
            actualDeliveryDate: shipping.actualDeliveryDate ? new Date(shipping.actualDeliveryDate) : null,
          },
        });
      }
      await tx.shippingTrackingEvent.createMany({
        data: backup.events.map((event) => ({ ...event, timestamp: new Date(event.timestamp), createdAt: new Date(event.createdAt) })),
        skipDuplicates: true,
      });
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
  console.log(`DESHECHO: ${backup.shippings.length} envío(s), ${backup.events.length} evento(s) restaurados.`);
  console.log(`PROD_WRITE_ROWS=${backup.shippings.length + backup.events.length}`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const undoFile = args.find((arg) => arg.startsWith("--undo="))?.slice("--undo=".length);
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if ((apply || undoFile) && !viaProdWrite) throw new Error("--apply y --undo solo corren con `npm run prod:write -- scripts/clean-foreign-tracking-events.ts … --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    if (undoFile) return await undo(db, undoFile);

    const ordersArg = args.find((arg) => arg.startsWith("--orders="))?.slice("--orders=".length);
    if (!ordersArg) throw new Error("falta --orders=ORD-a,ORD-b: este guion no limpia pedidos que no se nombren.");
    const only = new Set(ordersArg.split(",").map((order) => order.trim()).filter(Boolean));
    const detected = await findTargets(db);
    const missing = Array.from(only).filter((order) => !detected.some((target) => target.orderNumber === order));
    if (missing.length > 0) throw new Error(`no están entre los envíos con varios ciclos: ${missing.join(", ")}`);
    const targets = detected.filter((target) => only.has(target.orderNumber));

    console.log(`${apply ? "APLICAR" : "ENSAYO"}: ${targets.length} de ${detected.length} envío(s) con varios ciclos de entrega.`);
    for (const target of targets) {
      const code = target.trackingCode ? `…${target.trackingCode.slice(-4)}` : "sin número";
      console.log(
        `  ${target.orderNumber}: ${target.events} eventos (${target.delivered} entregas, ${target.pickups} recogidas) del ${day(target.firstTs)} al ${day(target.lastTs)} · guía ${code} → NULL · recogida ${day(target.pickupDate)}, estimada ${day(target.estimatedDeliveryDate)}, entrega ${day(target.actualDeliveryDate)} → NULL`,
      );
    }
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const shippingIds = targets.map((target) => target.shippingId);
    const events = await db.shippingTrackingEvent.findMany({ where: { shippingId: { in: shippingIds } }, orderBy: { timestamp: "asc" } });
    const at = new Date();
    const backup: Backup = {
      createdAt: at.toISOString(),
      shippings: targets.map(({ orderNumber, shippingId, trackingCode, pickupDate, estimatedDeliveryDate, actualDeliveryDate }) => ({ orderNumber, shippingId, trackingCode, pickupDate, estimatedDeliveryDate, actualDeliveryDate })),
      events: events.map((event) => ({ id: event.id, shippingId: event.shippingId, status: event.status, description: event.description, location: event.location, timestamp: event.timestamp.toISOString(), createdAt: event.createdAt.toISOString() })),
    };
    const dir = resolve(process.cwd(), "output/backups");
    mkdirSync(dir, { recursive: true });
    const file = `output/backups/foreign-tracking-${at.toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(resolve(process.cwd(), file), JSON.stringify(backup, null, 1));
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${at.toISOString()} clean-foreign-tracking-events ${targets.map((target) => target.orderNumber).join(",")} RESPALDO ${file} (${targets.length} envíos, ${events.length} eventos; fuera de Git) DESHACER npm run prod:write -- scripts/clean-foreign-tracking-events.ts --undo=${file} --expect new\n`,
    );

    await db.$transaction(
      async (tx) => {
        const deleted = await tx.shippingTrackingEvent.deleteMany({ where: { id: { in: events.map((event) => event.id) } } });
        if (deleted.count !== events.length) throw new Error(`se esperaban ${events.length} eventos y se borraban ${deleted.count}: nada se escribe`);
        for (const target of targets) {
          const { count } = await tx.shipping.updateMany({
            where: { id: target.shippingId, provider: "MANUAL", envioClickIdOrder: null, trackingCode: target.trackingCode },
            data: { trackingCode: null, pickupDate: null, estimatedDeliveryDate: null, actualDeliveryDate: null },
          });
          if (count !== 1) throw new Error(`${target.orderNumber} cambió desde el ensayo: nada se escribe`);
        }
      },
      { maxWait: 15_000, timeout: 120_000 },
    );
    console.log(`  ✓ ${events.length} eventos borrados; guía y fechas en NULL en ${targets.length} envío(s). Respaldo: ${file}`);
    console.log(`PROD_WRITE_ROWS=${events.length + targets.length}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
