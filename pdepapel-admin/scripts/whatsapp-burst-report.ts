/**
 * Modo ráfaga contra el bot actual, de las filas del modo sombra. Solo
 * lectura y solo conteos: ni texto ni teléfonos.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/whatsapp-burst-report.ts [días]
 */
import { PrismaClient } from "@prisma/client";

import { summarizeBurstDecisions } from "@/lib/whatsapp/shadow/report";

const days = Number(process.argv[2] ?? 7);
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("connection_limit", "1");
const db = new PrismaClient({ datasourceUrl: url.toString(), log: [] });

async function main() {
  const rows = await db.whatsAppBotShadowRun.findMany({
    where: { createdAt: { gte: new Date(Date.now() - days * 24 * 3600e3) } },
    select: { burstDecision: true, realOutcome: true },
  });
  const report = summarizeBurstDecisions(rows);
  console.log(`Últimos ${days} días: ${rows.length} filas del modo sombra, ${report.evaluated} con decisión de ráfaga.`);
  console.log(`Ráfagas (2+ mensajes seguidos): ${report.bursts}. El modo ráfaga contestaría otra cosa en ${report.differs}.`);
  for (const group of report.byChosenIntent) {
    const outcomes = group.realOutcomes.map((row) => `${row.outcome} ${row.count}`).join(", ");
    console.log(`- ${group.intent}: ${group.count} (el bot actual: ${outcomes})`);
  }
}

main().finally(() => db.$disconnect());
