// Evidencia de un pedido en la base de PRUEBAS (se niega a otra base).
// Uso (desde pdepapel-admin): node scripts/with-test-env.mjs node scripts/payments-sandbox/evidence.mjs <orderId> [desde ISO]
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

import { assertTestDatabaseEnv } from "../lib/test-database.mjs";
import { WORK } from "./paths.mjs";
const require = createRequire(process.cwd() + "/package.json");
const { PrismaClient } = require("@prisma/client");
assertTestDatabaseEnv(process.env, "sandbox de pagos");
const db = new PrismaClient();
const [orderId, since = "1970-01-01"] = process.argv.slice(2);
const MAIL = WORK + "mail.jsonl";
const mask = (e) => String(e).replace(/^(.)[^@]*@/, "$1…@");
try {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { payment: { select: { method: true } }, orderItems: { select: { productId: true, quantity: true } }, coupon: { select: { code: true, usedCount: true } } } });
  if (!o) { console.log("pedido no encontrado"); process.exit(1); }
  console.log("PEDIDO", JSON.stringify({ orderNumber: o.orderNumber, status: o.status, type: o.type, source: o.source, payment: o.payment?.method ?? null, total: o.total, paidAt: o.paidAt, couponId: o.couponId, coupon: o.coupon, adminNotes: o.adminNotes ? String(o.adminNotes).slice(0, 160) : null }));
  for (const it of o.orderItems) {
    const p = await db.product.findUnique({ where: { id: it.productId }, select: { name: true, stock: true } });
    console.log("LÍNEA", JSON.stringify({ product: p?.name, qty: it.quantity, stockNow: p?.stock }));
  }
  const mv = await db.inventoryMovement.findMany({ where: { referenceId: orderId }, orderBy: { createdAt: "asc" }, select: { type: true, quantity: true, previousStock: true, newStock: true, reason: true, createdAt: true } }).catch((e) => [{ error: e.message.split("\n")[0] }]);
  console.log("MOVIMIENTOS", mv.length); for (const m of mv) console.log("  ", JSON.stringify(m));
  const iss = await db.orderInventoryIssue.findMany({ where: { orderId } }).catch(() => []);
  console.log("PROBLEMAS DE INVENTARIO", iss.length); for (const i of iss) console.log("  ", JSON.stringify({ kind: i.kind, status: i.status, shortfall: i.shortfall ?? i.quantity ?? null }));
  const ev = await db.paymentWebhookEvent.findMany({ where: { OR: [{ orderId }, { orderReference: { contains: orderId } }] }, orderBy: { createdAt: "asc" }, select: { provider: true, eventType: true, status: true, statusCode: true, error: true, createdAt: true } });
  console.log("EVENTOS DE PAGO", ev.length); for (const e of ev) console.log("  ", JSON.stringify({ ...e, error: e.error ? e.error.slice(0, 120) : null }));
  if (existsSync(MAIL)) {
    const mails = readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.at >= since && (m.subject ?? "").includes(o.orderNumber));
    console.log("CORREOS (asunto con el número)", mails.length); for (const m of mails) console.log("  ", m.at, m.to.map(mask).join(","), "|", m.subject, m.text ? "+texto" : "SIN TEXTO");
  }
} finally { await db.$disconnect(); }
