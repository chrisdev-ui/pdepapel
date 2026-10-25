/**
 * Baja de las altas del boletín que confirmó un escáner de enlaces (la página
 * confirmaba al abrirse; arreglado en el lote del 2026-10-25). Regla revisada
 * por la dueña: estado ACTIVE y creadas desde el 2026-10-08 (16 el 10-25).
 * Pasan a dados de baja sin enviarles nada y sus cupones de bienvenida sin uso
 * se desactivan. Solo imprime conteos: ni correos ni códigos de cupón.
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/newsletter-suppress-scanner-confirmed.ts [--store <storeId>]
 * Escritura (después del despliegue, con el token de Christian):
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/newsletter-suppress-scanner-confirmed.ts --apply --expect new --confirmed-before=<ISO del despliegue> [--expected-count=<n>]
 *
 * `--confirmed-before` es obligatorio: solo cuenta lo confirmado antes de que
 * existiera el botón, nunca a quien confirmó después con el clic.
 *
 * Se niega si no son 16 filas, salvo que `--expected-count` diga el número
 * que se ve en el ensayo. Antes de escribir guarda la copia en
 * ~/pdepapel-backups/<fecha>/ y anota en `ops/prod-writes.log` una línea
 * DESHACER por fila. Todo va en una transacción e idempotente.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  applyScannerConfirmedSuppression,
  planScannerConfirmedSuppression,
  SCANNER_CONFIRMED_SINCE,
} from "@/lib/newsletter-retention";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const REVIEWED_COUNT = 16;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const storeFlag = args.indexOf("--store");
  const storeId = storeFlag === -1 ? DEFAULT_STORE_ID : args[storeFlag + 1];
  const expectedArg = args.find((arg) => arg.startsWith("--expected-count="));
  const expectedCount = expectedArg ? Number(expectedArg.split("=")[1]) : REVIEWED_COUNT;
  const beforeArg = args.find((arg) => arg.startsWith("--confirmed-before="));
  const confirmedBefore = beforeArg ? new Date(beforeArg.split("=")[1]) : null;
  if (!confirmedBefore || Number.isNaN(confirmedBefore.getTime())) {
    throw new Error("falta --confirmed-before=<ISO del despliegue del botón de confirmar>.");
  }
  const known = new Set(["--apply", "--store", storeId, expectedArg, beforeArg]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length || !storeId || storeId.startsWith("--") || !Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error(`uso: [--apply] [--store <storeId>] [--expected-count=<n>] (no entiendo: ${unknown.join(" ") || "un valor"})`);
  }

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/newsletter-suppress-scanner-confirmed.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const plan = await planScannerConfirmedSuppression(db, { storeId, confirmedBefore });
    console.log(JSON.stringify({
      modo: apply ? "APLICAR" : "ENSAYO",
      tienda: storeId,
      desde: SCANNER_CONFIRMED_SINCE.toISOString(),
      confirmadasAntesDe: confirmedBefore.toISOString(),
      activosQuePasanABaja: plan.subscriberIds.length,
      cuponesQueSeDesactivan: plan.couponIdsToDeactivate.length,
      cuponesYaUsadosQueSeDejan: plan.usedCouponIds.length,
    }, null, 1));

    if (plan.subscriberIds.length !== expectedCount) {
      throw new Error(`se esperaban ${expectedCount} filas y hay ${plan.subscriberIds.length}: no se escribe nada. Revisa el ensayo y repite con --expected-count=${plan.subscriberIds.length} si es correcto.`);
    }
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const before = await db.newsletterSubscriber.findMany({
      where: { id: { in: plan.subscriberIds } },
      select: { id: true, status: true, confirmedAt: true, unsubscribedAt: true, confirmationTokenHash: true, confirmationExpiresAt: true, welcomeCouponId: true },
    });
    const couponsBefore = await db.coupon.findMany({ where: { id: { in: plan.couponIdsToDeactivate } }, select: { id: true, isActive: true } });
    const at = new Date().toISOString();
    const dir = join(homedir(), "pdepapel-backups", at.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const backupPath = join(dir, `newsletter-suppress-scanner-confirmed-${at.replace(/[:.]/g, "-")}.json`);
    writeFileSync(backupPath, JSON.stringify({ takenAt: at, storeId, subscribers: before, coupons: couponsBefore }, null, 1), { mode: 0o600 });
    console.log(`Copia: ${backupPath}`);

    const sqlDate = (value: Date | null) => (value ? `'${value.toISOString().slice(0, 23).replace("T", " ")}'` : "NULL");
    const sqlText = (value: string | null) => (value ? `'${value}'` : "NULL");
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [
        ...before.map(
          (row) =>
            `# ${at} newsletter-suppress-scanner-confirmed DESHACER UPDATE NewsletterSubscriber SET status='${row.status}', unsubscribedAt=${sqlDate(row.unsubscribedAt)}, confirmationTokenHash=${sqlText(row.confirmationTokenHash)}, confirmationExpiresAt=${sqlDate(row.confirmationExpiresAt)} WHERE id='${row.id}';`,
        ),
        ...couponsBefore.map((coupon) => `# ${at} newsletter-suppress-scanner-confirmed DESHACER UPDATE Coupon SET isActive=${coupon.isActive ? 1 : 0} WHERE id='${coupon.id}';`),
        "",
      ].join("\n"),
    );

    const written = await db.$transaction((tx) => applyScannerConfirmedSuppression(tx, plan, { storeId }), { timeout: 60_000, maxWait: 15_000 });
    console.log(`Aplicado: ${written.unsubscribed} dados de baja, ${written.couponsDeactivated} cupones desactivados.`);
    console.log(`PROD_WRITE_ROWS=${written.unsubscribed + written.couponsDeactivated}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`newsletter-suppress-scanner-confirmed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
