// Datos de partida en la base de PRUEBAS (se niega a otra base):
//   alertas    avisos del panel a sandbox+admin@example.com y cupón SANDBOX10 (10 %)
//   stock N    fija el stock del producto e2e (caso «pagado sin stock»)
//   pos        una venta de punto de venta ya CANCELADA (datáfono Bold), para la excepción presencial
// Uso: node scripts/with-test-env.mjs node scripts/payments-sandbox/setup.mjs <alertas|stock N|pos>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

import { assertTestDatabaseEnv } from "../lib/test-database.mjs";
import { ADMIN, WORK } from "./paths.mjs";

const require = createRequire(ADMIN + "package.json");
const { PrismaClient } = require("@prisma/client");
assertTestDatabaseEnv(process.env, "sandbox de pagos");
const db = new PrismaClient();
const storeId =
  readFileSync(ADMIN + ".env.e2e.local", "utf8").match(/^\s*(?:export\s+)?E2E_ADMIN_STORE_ID\s*=\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim() ?? "e2e-admin-store";
const [command, value] = process.argv.slice(2);
try {
  if (command === "alertas") {
    await db.storeSettings.upsert({ where: { storeId }, update: { adminNotificationEmails: "sandbox+admin@example.com" }, create: { storeId, adminNotificationEmails: "sandbox+admin@example.com" } });
    await db.coupon.upsert({
      where: { code: "SANDBOX10" },
      update: { usedCount: 0, isActive: true },
      create: { storeId, code: "SANDBOX10", type: "PERCENTAGE", amount: 10, startDate: new Date(Date.now() - 864e5), endDate: new Date(Date.now() + 7 * 864e5), maxUses: 99 },
    });
    console.log("avisos → sandbox+admin@example.com, cupón SANDBOX10 listo");
  } else if (command === "stock") {
    const product = await db.product.update({ where: { id: "e2e-fair-product" }, data: { stock: Number(value) }, select: { stock: true } });
    console.log("stock ahora", product.stock);
  } else if (command === "pos") {
    const order = await db.order.create({
      data: {
        store: { connect: { id: storeId } },
        orderNumber: "POS-SANDBOX-" + Date.now(),
        fullName: "Prueba POS",
        phone: "+573025556677",
        address: "Tienda",
        email: "sandbox+pos@example.com",
        type: "POINT_OF_SALE",
        source: "POS",
        status: "CANCELLED",
        subtotal: 20000,
        total: 20000,
        orderItems: { create: [{ product: { connect: { id: "e2e-fair-product" } }, quantity: 2, price: 10000, name: "Producto feria E2E" }] },
        payment: { create: { method: "Bold", store: { connect: { id: storeId } } } },
      },
      select: { id: true, orderNumber: true },
    });
    writeFileSync(WORK + "order-pos.txt", order.id);
    writeFileSync(WORK + "number-pos.txt", order.orderNumber);
    console.log("venta presencial cancelada", order.orderNumber);
  } else {
    throw new Error("uso: setup.mjs <alertas|stock N|pos>");
  }
} finally {
  await db.$disconnect();
}
