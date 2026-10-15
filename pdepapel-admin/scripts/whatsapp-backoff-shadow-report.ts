/**
 * Lo que hicieron (o habrían hecho) la respuesta a los 10 min y el mensaje de
 * espera, para comparar con la simulación de
 * output/audits/whatsapp-backoff-proposal-2026-10-14.md. Solo lectura y solo
 * conteos y duraciones: ni texto, ni nombres, ni teléfonos.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/whatsapp-backoff-shadow-report.ts [días=7]
 */
export {};

process.env.PRISMA_LOG = "quiet";

const MIN = 60 * 1000;

async function main() {
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isFinite(days) || days <= 0) throw new Error("días inválidos");
  const { default: prismadb } = await import("@/lib/prismadb");
  const { summarizeWaitDecisions } = await import("@/lib/whatsapp/wait-report");
  const since = new Date(Date.now() - days * 24 * 60 * MIN);
  try {
    const decisions = await prismadb.whatsAppWaitDecision.findMany({
      where: { createdAt: { gte: since } },
      select: { conversationId: true, kind: true, mode: true, decision: true, reason: true, intent: true, night: true, decidedAt: true, outcome: true },
    });
    const conversationIds = Array.from(new Set(decisions.map((row) => row.conversationId)));
    const ownerMessages = conversationIds.length
      ? await prismadb.conversationMessage.findMany({
          where: { conversationId: { in: conversationIds }, sentBy: "OWNER", createdAt: { gte: since } },
          select: { conversationId: true, createdAt: true },
        })
      : [];
    const report = summarizeWaitDecisions(decisions, ownerMessages);
    console.log(`Últimos ${days} días (desde ${since.toISOString()}): ${decisions.length} decisiones.`);
    for (const [kind, block] of Object.entries(report)) {
      console.log(`\n${kind === "fallback" ? "Respuesta a los 10 min" : "Mensaje de espera"}`);
      console.log(`  enviadas ${block.sent} · habría enviado (sombra) ${block.wouldSend} · descartadas ${block.skipped}`);
      console.log(`  motivos: ${block.reasons.map(([reason, count]) => `${reason} ${count}`).join(", ") || "-"}`);
      if (block.intents.length) console.log(`  intenciones: ${block.intents.map(([intent, count]) => `${intent} ${count}`).join(", ")}`);
      console.log(`  de noche ${block.night}`);
      console.log(`  Paula escribió ≤2 min ${block.ownerWithin[2]} · ≤5 min ${block.ownerWithin[5]} · ≤15 min ${block.ownerWithin[15]} (alrededor de la decisión: ±2/±5 min, y ≤15 min después)`);
    }
  } finally {
    await prismadb.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Falló el informe:", error instanceof Error ? error.message : "desconocido");
  process.exit(1);
});
