import { describe, expect, it } from "vitest";

import { isOkOutcome, summarizeCommandUsage } from "@/lib/whatsapp/command-usage";

describe("resumen de uso de los comandos (14 días)", () => {
  it("separa lo que salió bien de los motivos de error, por comando", () => {
    const usage = summarizeCommandUsage([
      { command: "pedido", outcome: "draft_linked", count: 3 },
      { command: "pedido", outcome: "draft_no_conversation", count: 1 },
      { command: "pedido", outcome: "missing_contact", count: 2 },
      { command: "pedido", outcome: "bad_phone", count: 4 },
      { command: "estado", outcome: "ok", count: 2 },
      { command: "guia", outcome: "guide_quoted", count: 1 },
      { command: "guia", outcome: null, count: 1 },
    ]);
    expect(usage[0]).toEqual({
      command: "pedido",
      total: 10,
      ok: 4,
      errors: [
        { outcome: "bad_phone", label: "celular inválido", count: 4 },
        { outcome: "missing_contact", label: "sin celular ni @usuario", count: 2 },
      ],
    });
    expect(usage.find((row) => row.command === "estado")).toEqual({ command: "estado", total: 2, ok: 2, errors: [] });
    expect(usage.find((row) => row.command === "guia")?.errors).toEqual([{ outcome: "pending", label: "sin respuesta todavía", count: 1 }]);
  });

  it("un motivo nuevo sin etiqueta se muestra legible, nunca se pierde", () => {
    const [row] = summarizeCommandUsage([{ command: "confirmar", outcome: "algo_nuevo", count: 1 }]);
    expect(row.errors).toEqual([{ outcome: "algo_nuevo", label: "algo nuevo", count: 1 }]);
  });

  it("cuenta como bien: ok, guía cotizada o creada y cualquier borrador creado", () => {
    for (const outcome of ["ok", "guide_quoted", "guide_created", "draft_linked", "draft_conversation_busy"]) expect(isOkOutcome(outcome)).toBe(true);
    for (const outcome of [null, "missing_contact", "wrong_code", "error", "stale"]) expect(isOkOutcome(outcome)).toBe(false);
  });
});
