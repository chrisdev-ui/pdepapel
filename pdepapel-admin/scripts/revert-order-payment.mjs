/**
 * Revierte el pago marcado por error del pedido contra entrega
 * ORD-1791998787841-915 (2026-10-15, referencia «1230000»). Reglas y efectos
 * en `scripts/lib/order-payment-revert.mjs`. No envía correos ni avisos.
 * Imprime estados, fechas, ids y cantidades: nada de la clienta.
 *
 *   node --env-file=.env scripts/revert-order-payment.mjs
 *       ENSAYO con el usuario de solo lectura.
 *   npm run prod:write -- scripts/revert-order-payment.mjs --expect new
 *       ENSAYO bajo el envoltorio (gasta la aprobación, no escribe).
 *   npm run prod:write -- scripts/revert-order-payment.mjs --apply --expect-rows 1 --expect new
 *       Escribe en una transacción si el pedido sigue exactamente como en el
 *       ensayo. Otra corrida no encuentra nada que revertir y se niega.
 *   --sin-apartado
 *       No aparta lo devuelto: las unidades vuelven a la venta hasta el envío.
 *
 * El motivo aprobado tiene que nombrar el pedido, el pago y el kardex.
 */
import { createRequire } from "node:module";

import { applyOrderPaymentRevert, assertExpectedRows, describeOrderState, planOrderPaymentRevert, stockToReturn } from "./lib/order-payment-revert.mjs";

const TARGET = {
  storeId: "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd",
  orderId: "f8c581c5-90c6-4a7e-9717-b9726871519a",
  orderNumber: "ORD-1791998787841-915",
  reference: "1230000",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const hold = !args.includes("--sin-apartado");
const expectRows = args.includes("--expect-rows") ? args[args.indexOf("--expect-rows") + 1] : undefined;
const unknown = args.filter((arg) => !["--apply", "--sin-apartado", "--expect-rows", expectRows].includes(arg));
if (unknown.length || (args.includes("--expect-rows") && !/^\d+$/.test(expectRows ?? ""))) {
  throw new Error(`uso: [--apply --expect-rows 1] (no entiendo: ${unknown.join(" ") || "un valor"})`);
}
if (apply && expectRows === undefined) throw new Error("--apply necesita --expect-rows 1.");

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/revert-order-payment.mjs --apply --expect-rows 1 --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient({ log: [] });
}

try {
  const plan = await planOrderPaymentRevert(db, TARGET);
  console.log(`Pedido ${TARGET.orderNumber} (${TARGET.orderId}) · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  if (!plan.ok) console.log(`No se puede revertir: ${plan.problems.join("; ")}`);
  if (plan.order) {
    const before = describeOrderState(plan.order);
    const after = {
      ...before,
      status: "PENDING",
      paidAt: null,
      "payment.transactionId": null,
      financieros: "null",
      "shipping.isCOD": plan.order.shipping ? true : null,
    };
    console.log("Campo                   antes → después");
    for (const key of Object.keys(before)) console.log(`  ${key.padEnd(22)} ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
    console.log(`Inventario: ${plan.movements.length} ventas ORDER_PLACED → ${plan.movements.length} devoluciones ORDER_CANCELLED`);
    for (const [productId, units] of stockToReturn(plan.movements)) {
      const current = plan.stock[productId];
      const held = plan.reserved[productId];
      console.log(`  ${productId}  +${units}  stock ${current} → ${current + units} · apartadas ${held} → ${hold ? held + units : held} · disponibles ${current - held} → ${hold ? current - held : current + units - held}`);
    }
    console.log(hold ? "Apartado: 1 reserva CONVERTED de este pedido con lo devuelto (se consume al salir el envío)" : "Apartado: no (--sin-apartado)");
  }

  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    assertExpectedRows(plan, Number(expectRows));
    const written = await applyOrderPaymentRevert(db, plan, TARGET, { hold });
    console.log(`Escritos: pedido ${written.order} · pago ${written.payment} · envío ${written.shipping} · movimientos ${written.movements} · reserva ${written.reservation ?? "no"}`);
    console.log(`PROD_WRITE_ROWS=${written.order}`);
    const reread = await planOrderPaymentRevert(db, TARGET);
    console.log(`Después: ${JSON.stringify(reread.order ? describeOrderState(reread.order) : null)}`);
    console.log(`Stock después: ${JSON.stringify(written.stock)}`);
  }
} finally {
  await db.$disconnect();
}
