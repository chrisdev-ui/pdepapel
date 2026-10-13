/**
 * Modo ráfaga contra el bot actual. Solo lectura y solo conteos: ni texto, ni
 * nombres, ni teléfonos, ni BSUID.
 *
 *   Filas del modo sombra (`burstDecision`) de los últimos N días:
 *     node --env-file=.env node_modules/.bin/tsx scripts/whatsapp-burst-report.ts [días]
 *
 *   Repetición sobre el historial real de los últimos N días, con las mismas
 *   funciones de producción (lib/whatsapp/burst.ts, lib/whatsapp/burst-replay.ts).
 *   El mensaje al que contestó el bot sale del modo sombra (`inboundMessageId`
 *   con su `realCount`); lo anterior a que existiera queda «sin vínculo»:
 *     node --env-file=.env node_modules/.bin/tsx scripts/whatsapp-burst-report.ts --replay 30
 *
 * No escribe nada, no encola, no llama al bot ni envía.
 */
process.env.PRISMA_LOG = "quiet";

const args = process.argv.slice(2);
const replayAt = args.indexOf("--replay");

async function shadowReport(days: number) {
  const { default: prismadb } = await import("@/lib/prismadb");
  const { summarizeBurstDecisions } = await import("@/lib/whatsapp/shadow/report");
  const rows = await prismadb.whatsAppBotShadowRun.findMany({
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

async function replay(days: number) {
  const { default: prismadb } = await import("@/lib/prismadb");
  const { chooseFromBurst, loadBurstContext } = await import("@/lib/whatsapp/burst");
  const { findBursts, judgeBurst, summarizeReplay } = await import("@/lib/whatsapp/burst-replay");
  const { getActiveBotKeywords } = await import("@/lib/whatsapp/bot-replies");
  type Verdict = ReturnType<typeof judgeBurst>;

  const since = new Date(Date.now() - days * 24 * 3600e3);
  const rows = await prismadb.conversationMessage.findMany({
    where: { createdAt: { gte: since }, conversation: { channel: "WHATSAPP" } },
    orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      conversationId: true,
      externalId: true,
      direction: true,
      sentBy: true,
      body: true,
      mediaType: true,
      metadata: true,
      createdAt: true,
      conversation: { select: { storeId: true } },
    },
  });
  const shadowRows = await prismadb.whatsAppBotShadowRun.findMany({ select: { inboundMessageId: true, realCount: true, createdAt: true } });
  const shadow = new Map(shadowRows.map((row) => [row.inboundMessageId, { realCount: row.realCount }]));
  const shadowSince = shadowRows.reduce<Date | null>((min, row) => (!min || row.createdAt < min ? row.createdAt : min), null);

  const byConversation = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byConversation.get(row.conversationId) ?? [];
    list.push(row);
    byConversation.set(row.conversationId, list);
  }
  const keywordsByStore = new Map<string, Awaited<ReturnType<typeof getActiveBotKeywords>>>();
  const verdicts: Verdict[] = [];
  for (const [conversationId, list] of Array.from(byConversation.entries())) {
    const storeId = list[0].conversation.storeId;
    if (!keywordsByStore.has(storeId)) keywordsByStore.set(storeId, await getActiveBotKeywords(storeId));
    for (const burst of findBursts(list)) {
      const last = burst.messages[burst.messages.length - 1];
      const ctx = await loadBurstContext(conversationId, burst.messages[0].at, last.at, keywordsByStore.get(storeId)!);
      const choice = chooseFromBurst(burst.messages, ctx);
      if (choice) verdicts.push(judgeBurst(burst, choice, shadow, ctx));
    }
  }
  const summary = summarizeReplay(verdicts);
  console.log(
    JSON.stringify({
      days,
      customerMessages: rows.filter((row) => row.direction === "INBOUND" && row.sentBy === "CUSTOMER").length,
      conversations: byConversation.size,
      shadowLinkSince: shadowSince?.toISOString().slice(0, 16) ?? null,
      ...summary,
    }),
  );
}

async function main() {
  const { default: prismadb } = await import("@/lib/prismadb");
  try {
    if (replayAt >= 0) await replay(Number(args[replayAt + 1] ?? 30));
    else await shadowReport(Number(args[0] ?? 7));
  } finally {
    await prismadb.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Falló el informe:", error instanceof Error ? error.message : "desconocido");
  process.exitCode = 1;
});

export {};
