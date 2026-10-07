import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import type { MercadoLibreHealthIssue } from "./health";

/**
 * Estado de las alertas de salud de Mercado Libre (#8).
 *
 * Las alertas se recalculan en cada corrida (health.ts) y antes no tenían
 * memoria: el aviso salía igual cada día y en el panel no había cómo
 * marcarlas como revisadas. Aquí cada alerta tiene:
 * - una **clave** estable (qué es: la publicación, la venta, la pregunta…);
 * - una **huella** de lo que importa de ella. Si cambia, es otra alerta.
 *
 * El correo sale solo para alertas cuya huella no se ha avisado y no está
 * marcada como revisada. Una alerta que deja de aparecer queda resuelta; si
 * vuelve, cuenta como nueva.
 *
 * La huella NO usa el texto que se muestra: «Pagada hace 9 días» cambia cada
 * día y «3 avisos sin procesar» cambia con el conteo, y la alerta volvería a
 * salir a diario. Cada tipo usa solo datos estables:
 *
 * | Tipo                | Clave                         | Huella (además de clave) |
 * |---------------------|-------------------------------|--------------------------|
 * | listing_error       | publicación                   | mensaje de error         |
 * | listing_incomplete  | publicación                   | —                        |
 * | stock_risk          | publicación                   | stock local              |
 * | margin_risk         | publicación                   | —                        |
 * | inventory_exception | venta                         | mensaje de inventario    |
 * | outbox_failed       | tarea de la cola              | mensaje de error         |
 * | webhook_failed      | una por conexión              | —                        |
 * | settlement_pending  | venta                         | —                        |
 * | question            | pregunta                      | —                        |
 * | shipment            | envío                         | —                        |
 * | claim               | reclamo                       | estado del reclamo       |
 */
export type AlertIdentity = { alertKey: string; fingerprint: string };

type Db = Pick<PrismaClient, "marketplaceAlertState" | "$executeRaw">;

/** Una alerta resuelta hace más de esto se borra. */
export const RESOLVED_RETENTION_DAYS = 30;

/**
 * Fila reservada (no es una alerta) que hace de candado por conexión: dos
 * corridas a la vez se repartirían las alertas y mandarían dos correos.
 * Ninguna clave de alerta empieza por «__».
 */
export const RUN_LOCK_KEY = "__run_lock__";
/** Un candado más viejo que esto es de una corrida que murió: se puede tomar. */
export const RUN_LOCK_TTL_MS = 10 * 60 * 1000;
// Comparación exacta: `startsWith: "__"` se vuelve `LIKE '__%'` en MySQL, y
// «_» es comodín allí: excluía todas las filas.
const notReserved = { alertKey: { not: RUN_LOCK_KEY } };

export function getAlertIdentity(issue: MercadoLibreHealthIssue): AlertIdentity {
  const entity =
    issue.listingId ?? issue.orderId ?? issue.entityId ?? issue.title;
  let alertKey = `${issue.kind}:${entity}`;
  let parts: (string | number)[] = [];
  switch (issue.kind) {
    case "listing_error":
    case "listing_incomplete":
    case "margin_risk":
      alertKey = `${issue.kind}:${issue.listingId ?? issue.title}`;
      if (issue.kind === "listing_error") parts = [issue.detail];
      break;
    case "stock_risk":
      alertKey = `${issue.kind}:${issue.listingId ?? issue.title}`;
      parts = [issue.stock ?? ""];
      break;
    case "inventory_exception":
    case "settlement_pending":
      alertKey = `${issue.kind}:${issue.orderId ?? issue.title}`;
      if (issue.kind === "inventory_exception") parts = [issue.detail];
      break;
    case "outbox_failed":
      alertKey = `${issue.kind}:${issue.entityId ?? issue.title}`;
      parts = [issue.detail];
      break;
    case "webhook_failed":
      alertKey = issue.kind;
      break;
    case "question":
    case "shipment":
      alertKey = `${issue.kind}:${issue.entityId ?? issue.title}`;
      break;
    case "claim":
      alertKey = `${issue.kind}:${issue.entityId ?? issue.title}`;
      parts = [issue.detail];
      break;
  }
  const fingerprint = createHash("sha256")
    .update([issue.kind, alertKey, ...parts].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
  return { alertKey: alertKey.slice(0, 191), fingerprint };
}

export type IdentifiedIssue = MercadoLibreHealthIssue & AlertIdentity;

/** Las alertas de hoy con su clave; si dos coinciden en clave, queda la primera. */
export function identifyIssues(issues: MercadoLibreHealthIssue[]): IdentifiedIssue[] {
  const seen = new Set<string>();
  const identified: IdentifiedIssue[] = [];
  for (const issue of issues) {
    const identity = getAlertIdentity(issue);
    if (seen.has(identity.alertKey)) continue;
    seen.add(identity.alertKey);
    identified.push({ ...issue, ...identity });
  }
  return identified;
}

/**
 * Pone al día la tabla con las alertas de hoy: crea las nuevas, actualiza
 * huella y «vista por última vez», da por resueltas las que ya no aparecen
 * y reinicia las que vuelven después de resolverse (cuentan como nuevas).
 */
export async function syncAlertStates(
  connectionId: string,
  issues: IdentifiedIssue[],
  { db = prismadb as Db, now = new Date() }: { db?: Db; now?: Date } = {},
) {
  const keys = issues.map((issue) => issue.alertKey);
  const existing = await db.marketplaceAlertState.findMany({
    where: { connectionId, ...notReserved },
    select: { id: true, alertKey: true, resolvedAt: true },
  });
  const byKey = new Map(existing.map((row) => [row.alertKey, row]));

  const fresh = issues.filter((issue) => !byKey.has(issue.alertKey));
  if (fresh.length > 0) {
    // skipDuplicates: si otra corrida la creó entre la lectura y aquí, no falla.
    await db.marketplaceAlertState.createMany({
      data: fresh.map((issue) => ({
        connectionId,
        alertKey: issue.alertKey,
        kind: issue.kind,
        fingerprint: issue.fingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
      })),
      skipDuplicates: true,
    });
  }

  for (const issue of issues) {
    const row = byKey.get(issue.alertKey);
    if (!row) continue;
    if (row.resolvedAt) {
      // Volvió después de resolverse: es una alerta nueva. Una sola
      // sentencia condicionada a que siga resuelta, para que dos corridas a
      // la vez no la reinicien dos veces (y la segunda borre el aviso que
      // acaba de tomar la primera).
      await db.$executeRaw`UPDATE \`MarketplaceAlertState\`
        SET \`resolvedAt\` = NULL, \`firstSeenAt\` = ${now}, \`lastSeenAt\` = ${now},
            \`fingerprint\` = ${issue.fingerprint}, \`kind\` = ${issue.kind},
            \`notifiedFingerprint\` = NULL, \`lastNotifiedAt\` = NULL,
            \`dismissedFingerprint\` = NULL, \`dismissedAt\` = NULL, \`dismissedBy\` = NULL,
            \`updatedAt\` = ${now}
        WHERE \`id\` = ${row.id} AND \`resolvedAt\` IS NOT NULL`;
    } else {
      await db.marketplaceAlertState.update({
        where: { id: row.id },
        data: { fingerprint: issue.fingerprint, kind: issue.kind, lastSeenAt: now },
      });
    }
  }

  await db.marketplaceAlertState.updateMany({
    where: {
      connectionId,
      resolvedAt: null,
      AND: [notReserved, { alertKey: { notIn: keys.length ? keys : [RUN_LOCK_KEY] } }],
    },
    data: { resolvedAt: now },
  });
  await db.marketplaceAlertState.deleteMany({
    where: {
      connectionId,
      resolvedAt: { lt: new Date(now.getTime() - RESOLVED_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
    },
  });
}

/**
 * Toma el candado de la conexión. Un INSERT IGNORE crea la fila la primera
 * vez; después, un único UPDATE condicionado la toma si está libre o vencida.
 * Solo una corrida lo consigue.
 */
export async function acquireRunLock(
  connectionId: string,
  { db = prismadb as Db, now = new Date() }: { db?: Db; now?: Date } = {},
): Promise<boolean> {
  await db.$executeRaw`INSERT IGNORE INTO \`MarketplaceAlertState\`
    (\`id\`, \`connectionId\`, \`alertKey\`, \`kind\`, \`fingerprint\`, \`firstSeenAt\`, \`lastSeenAt\`, \`createdAt\`, \`updatedAt\`)
    VALUES (${randomUUID()}, ${connectionId}, ${RUN_LOCK_KEY}, ${"lock"}, ${"lock"}, ${now}, ${now}, ${now}, ${now})`;
  const staleBefore = new Date(now.getTime() - RUN_LOCK_TTL_MS);
  const taken = await db.$executeRaw`UPDATE \`MarketplaceAlertState\`
    SET \`lastNotifiedAt\` = ${now}, \`updatedAt\` = ${now}
    WHERE \`connectionId\` = ${connectionId} AND \`alertKey\` = ${RUN_LOCK_KEY}
      AND (\`lastNotifiedAt\` IS NULL OR \`lastNotifiedAt\` < ${staleBefore})`;
  return taken === 1;
}

export async function releaseRunLock(
  connectionId: string,
  { db = prismadb as Db, now }: { db?: Db; now: Date },
) {
  await db.$executeRaw`UPDATE \`MarketplaceAlertState\`
    SET \`lastNotifiedAt\` = NULL
    WHERE \`connectionId\` = ${connectionId} AND \`alertKey\` = ${RUN_LOCK_KEY} AND \`lastNotifiedAt\` = ${now}`;
}

export type AlertClaim = {
  issue: IdentifiedIssue;
  previousFingerprint: string | null;
  previousNotifiedAt: Date | null;
};

/**
 * Toma las alertas que hay que avisar: huella aún no avisada y no marcada
 * como revisada. Cada una con un único UPDATE condicionado (no `updateMany`,
 * que Prisma parte en SELECT + UPDATE sin la guarda; ver
 * lib/notification-retry.ts): si dos corridas coinciden, cada alerta la toma
 * una sola y sale en un solo correo.
 */
export async function claimAlertsToNotify(
  connectionId: string,
  issues: IdentifiedIssue[],
  { db = prismadb as Db, now = new Date() }: { db?: Db; now?: Date } = {},
): Promise<AlertClaim[]> {
  const rows = await db.marketplaceAlertState.findMany({
    where: { connectionId, alertKey: { in: issues.map((issue) => issue.alertKey) } },
    select: { alertKey: true, notifiedFingerprint: true, lastNotifiedAt: true, dismissedFingerprint: true },
  });
  const byKey = new Map(rows.map((row) => [row.alertKey, row]));
  const claims: AlertClaim[] = [];
  for (const issue of issues) {
    const row = byKey.get(issue.alertKey);
    if (!row) continue;
    if (row.notifiedFingerprint === issue.fingerprint) continue;
    if (row.dismissedFingerprint === issue.fingerprint) continue;
    const claimed = await db.$executeRaw`UPDATE \`MarketplaceAlertState\`
      SET \`notifiedFingerprint\` = ${issue.fingerprint}, \`lastNotifiedAt\` = ${now}, \`updatedAt\` = ${now}
      WHERE \`connectionId\` = ${connectionId} AND \`alertKey\` = ${issue.alertKey}
        AND (\`notifiedFingerprint\` IS NULL OR \`notifiedFingerprint\` <> ${issue.fingerprint})
        AND (\`dismissedFingerprint\` IS NULL OR \`dismissedFingerprint\` <> ${issue.fingerprint})`;
    if (claimed === 1) {
      claims.push({
        issue,
        previousFingerprint: row.notifiedFingerprint,
        previousNotifiedAt: row.lastNotifiedAt,
      });
    }
  }
  return claims;
}

/**
 * El correo no salió: devuelve las alertas tomadas a como estaban, para que
 * la próxima corrida las vuelva a intentar. Sin esto, una caída de Resend
 * las callaba hasta que su huella cambiara.
 */
export async function releaseAlertClaims(
  connectionId: string,
  claims: AlertClaim[],
  { db = prismadb as Db, now = new Date() }: { db?: Db; now?: Date } = {},
) {
  for (const claim of claims) {
    await db.$executeRaw`UPDATE \`MarketplaceAlertState\`
      SET \`notifiedFingerprint\` = ${claim.previousFingerprint}, \`lastNotifiedAt\` = ${claim.previousNotifiedAt}
      WHERE \`connectionId\` = ${connectionId} AND \`alertKey\` = ${claim.issue.alertKey}
        AND \`notifiedFingerprint\` = ${claim.issue.fingerprint} AND \`lastNotifiedAt\` = ${now}`;
  }
}

/**
 * Marca como revisadas (o deshace) las alertas de hoy. Guarda la huella
 * actual: la alerta queda callada, en el correo y en el panel, hasta que
 * cambie. Solo toca alertas que siguen abiertas.
 */
export async function setAlertsReviewed(
  connectionId: string,
  issues: IdentifiedIssue[],
  target: { keys: string[] } | { all: true },
  reviewed: boolean,
  { db = prismadb as Db, now = new Date(), userId }: { db?: Db; now?: Date; userId: string },
): Promise<number> {
  await syncAlertStates(connectionId, issues, { db, now });
  const selected =
    "all" in target ? issues : issues.filter((issue) => target.keys.includes(issue.alertKey));
  let changed = 0;
  for (const issue of selected) {
    const result = await db.marketplaceAlertState.updateMany({
      where: { connectionId, alertKey: issue.alertKey, resolvedAt: null },
      data: reviewed
        ? { dismissedFingerprint: issue.fingerprint, dismissedAt: now, dismissedBy: userId.slice(0, 191) }
        : { dismissedFingerprint: null, dismissedAt: null, dismissedBy: null },
    });
    changed += result.count;
  }
  return changed;
}

/** Para el panel: cada alerta con su clave y si está revisada en su huella actual. */
export async function annotateIssues(
  connectionId: string,
  issues: MercadoLibreHealthIssue[],
  { db = prismadb as Db }: { db?: Db } = {},
): Promise<(IdentifiedIssue & { reviewed: boolean })[]> {
  const identified = identifyIssues(issues);
  const rows = await db.marketplaceAlertState.findMany({
    where: { connectionId, alertKey: { in: identified.map((issue) => issue.alertKey) } },
    select: { alertKey: true, dismissedFingerprint: true },
  });
  const dismissed = new Map(rows.map((row) => [row.alertKey, row.dismissedFingerprint]));
  return identified.map((issue) => ({
    ...issue,
    reviewed: dismissed.get(issue.alertKey) === issue.fingerprint,
  }));
}
