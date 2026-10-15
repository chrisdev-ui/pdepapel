/**
 * Resumen del registro de `WhatsAppWaitDecision` frente a los mensajes de
 * Paula: lo mismo que miden las tablas de la propuesta (enviadas, en sombra,
 * a ±2/±5 min de un mensaje de Paula y si ella escribió ≤15 min después).
 * Puro: recibe filas ya leídas.
 */
const MIN = 60 * 1000;

export interface WaitDecisionRow {
  conversationId: string;
  kind: string;
  decision: string;
  reason: string | null;
  intent: string | null;
  night: boolean;
  decidedAt: Date;
}

export interface WaitKindSummary {
  sent: number;
  wouldSend: number;
  skipped: number;
  night: number;
  reasons: [string, number][];
  intents: [string, number][];
  /** Entre las enviadas o en sombra: Paula escribió a ±2, ±5 min, o ≤15 min después. */
  ownerWithin: { 2: number; 5: number; 15: number };
}

const tally = (values: (string | null)[]) => {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1]);
};

export function summarizeWaitDecisions(rows: readonly WaitDecisionRow[], ownerMessages: readonly { conversationId: string; createdAt: Date }[]): Record<"fallback" | "holding", WaitKindSummary> {
  const byConversation = new Map<string, number[]>();
  for (const message of ownerMessages) byConversation.set(message.conversationId, [...(byConversation.get(message.conversationId) ?? []), message.createdAt.getTime()]);
  const summarize = (kind: "fallback" | "holding"): WaitKindSummary => {
    const own = rows.filter((row) => row.kind === kind);
    const acted = own.filter((row) => row.decision === "send" || row.decision === "would_send");
    const near = (row: WaitDecisionRow, before: number, after: number) =>
      (byConversation.get(row.conversationId) ?? []).some((at) => at >= row.decidedAt.getTime() - before * MIN && at <= row.decidedAt.getTime() + after * MIN);
    return {
      sent: own.filter((row) => row.decision === "send").length,
      wouldSend: own.filter((row) => row.decision === "would_send").length,
      skipped: own.filter((row) => row.decision === "skip").length,
      night: own.filter((row) => row.night).length,
      reasons: tally(own.filter((row) => row.decision === "skip").map((row) => row.reason)),
      intents: tally(acted.map((row) => row.intent)),
      ownerWithin: { 2: acted.filter((row) => near(row, 2, 2)).length, 5: acted.filter((row) => near(row, 5, 5)).length, 15: acted.filter((row) => near(row, 0, 15)).length },
    };
  };
  return { fallback: summarize("fallback"), holding: summarize("holding") };
}
