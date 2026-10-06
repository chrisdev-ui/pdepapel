/**
 * GO / NO-GO del corte de la base a us-east4 (docs/runbooks/db-region-migration.md).
 * Solo lectura: se corre con pdepapel_ro y solo imprime conteos.
 *
 *   node --env-file=.env scripts/backup/cutover-go-no-go.mjs
 *
 * GO cuando las cuatro comprobaciones dan 0; si no, sale con código 1 y dice
 * cuál falló. Las ventanas se miden con el reloj de la base (UTC).
 */
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const count = async (sql) => Number((await db.$queryRawUnsafe(sql))[0].n);
const since = (minutes) => `UTC_TIMESTAMP(3) - INTERVAL ${minutes} MINUTE`;

/** Tablas que el panel modifica a mano (updatedAt) y el kardex (createdAt). */
const ADMIN_TABLES = ["Order", "Product", "ProductGroup", "Shipping", "PaymentDetails", "Category", "Offer", "Coupon", "RestockOrder", "StoreSettings"];

try {
  const [{ now }] = await db.$queryRawUnsafe("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s UTC') AS now");
  const checks = [];

  checks.push({
    nombre: "Pedidos creados o pagados en los últimos 30 min",
    n: await count(`SELECT COUNT(*) n FROM \`Order\` WHERE createdAt >= ${since(30)} OR paidAt >= ${since(30)}`),
  });
  checks.push({
    nombre: "Pedidos pendientes de pago creados en los últimos 60 min",
    n: await count(`SELECT COUNT(*) n FROM \`Order\` WHERE status IN ('PENDING', 'CREATED') AND createdAt >= ${since(60)}`),
  });

  let admin = await count(`SELECT COUNT(*) n FROM \`InventoryMovement\` WHERE createdAt >= ${since(15)}`);
  const adminDetail = { InventoryMovement: admin };
  for (const table of ADMIN_TABLES) {
    const n = await count(`SELECT COUNT(*) n FROM \`${table}\` WHERE updatedAt >= ${since(15)}`);
    if (n) adminDetail[table] = n;
    admin += n;
  }
  checks.push({ nombre: "Escrituras del panel en los últimos 15 min", n: admin, detalle: adminDetail });

  const webhookDetail = {
    MarketplaceWebhookEvent: await count(`SELECT COUNT(*) n FROM \`MarketplaceWebhookEvent\` WHERE createdAt >= ${since(10)}`),
    PaymentWebhookEvent: await count(`SELECT COUNT(*) n FROM \`PaymentWebhookEvent\` WHERE createdAt >= ${since(10)}`),
    ConversationMessage: await count(`SELECT COUNT(*) n FROM \`ConversationMessage\` WHERE createdAt >= ${since(10)}`),
  };
  checks.push({ nombre: "Webhooks y mensajes recibidos en los últimos 10 min", n: Object.values(webhookDetail).reduce((a, b) => a + b, 0), detalle: webhookDetail });

  const go = checks.every((check) => check.n === 0);
  console.log(`Reloj de la base: ${now}`);
  for (const check of checks) {
    const extra = check.n && check.detalle ? ` ${JSON.stringify(Object.fromEntries(Object.entries(check.detalle).filter(([, v]) => v)))}` : "";
    console.log(`${check.n === 0 ? "OK   " : "FALLA"} ${check.nombre}: ${check.n}${extra}`);
  }
  console.log(go ? "RESULTADO: GO" : "RESULTADO: NO-GO (esperar y volver a comprobar en 10 min)");
  if (!go) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
