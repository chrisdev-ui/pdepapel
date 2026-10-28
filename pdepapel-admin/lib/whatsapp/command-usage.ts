/**
 * Uso de los comandos del chat consigo misma en los últimos días: cuántos
 * salieron bien y por qué fallaron los demás. Solo lee el `outcome` que ya
 * guarda cada fila; no cambia ningún comando.
 */
export const COMMAND_USAGE_DAYS = 14;

const OK_OUTCOMES = new Set(["ok", "guide_quoted", "guide_created"]);

export const OUTCOME_LABELS: Record<string, string> = {
  missing_contact: "sin celular ni @usuario",
  bad_phone: "celular inválido",
  missing_amount: "sin valor",
  missing_order: "sin número de pedido",
  order_not_found: "pedido no encontrado",
  missing_code: "sin código",
  wrong_code: "código equivocado",
  too_many_attempts: "tres códigos equivocados",
  no_pending_guide: "sin guía esperando",
  claimed_elsewhere: "repetido mientras se creaba",
  guide_blocked: "guía bloqueada",
  guide_unavailable: "sin tarifa",
  guide_rate_limited: "EnvioClick ocupado",
  guide_error: "error de EnvioClick",
  unknown_command: "comando desconocido",
  stale: "llegó tarde",
  rate_limited: "demasiados seguidos",
  error: "error",
  pending: "sin respuesta todavía",
};

export const isOkOutcome = (outcome: string | null) => outcome !== null && (OK_OUTCOMES.has(outcome) || outcome.startsWith("draft_"));

export const outcomeLabel = (outcome: string) => OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, " ");

export interface CommandUsage {
  command: string;
  total: number;
  ok: number;
  /** Motivos de los que no salieron bien, del más frecuente al menos. */
  errors: Array<{ outcome: string; label: string; count: number }>;
}

/** Filas `{ command, outcome, count }` (de un groupBy) → una línea por comando. */
export function summarizeCommandUsage(rows: Array<{ command: string; outcome: string | null; count: number }>): CommandUsage[] {
  const byCommand = new Map<string, CommandUsage>();
  for (const row of rows) {
    const usage = byCommand.get(row.command) ?? { command: row.command, total: 0, ok: 0, errors: [] };
    usage.total += row.count;
    if (isOkOutcome(row.outcome)) {
      usage.ok += row.count;
    } else {
      const outcome = row.outcome ?? "pending";
      const existing = usage.errors.find((error) => error.outcome === outcome);
      if (existing) existing.count += row.count;
      else usage.errors.push({ outcome, label: outcomeLabel(outcome), count: row.count });
    }
    byCommand.set(row.command, usage);
  }
  return Array.from(byCommand.values())
    .map((usage) => ({ ...usage, errors: usage.errors.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")) }))
    .sort((a, b) => b.total - a.total || a.command.localeCompare(b.command));
}
