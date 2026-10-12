import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool, type ModelMessage } from "ai";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { COPILOT_FAST_MODEL } from "@/lib/copiloto/config";
import { readKnowledgeDrafts } from "@/lib/copiloto/knowledge";
import { COPILOT_RULES, renderKnowledge } from "@/lib/copiloto/prompt";
import { buildCopilotTools } from "@/lib/copiloto/tools";

/**
 * Sonda de la caché de prompts de OpenAI (solo con COPILOT_CACHE_PROBE=1).
 * Mide `cachedInputTokens` al cambiar solo la cola del mensaje de sistema,
 * al mover lo variable a un segundo mensaje de sistema y al agregar una
 * herramienta. Prefijo del tamaño de producción (los 41 borradores como
 * aprobados), salida de pocos tokens y clave de caché propia. Solo imprime
 * conteos de tokens.
 */
const ENABLED = process.env.COPILOT_CACHE_PROBE === "1" && Boolean(process.env.OPENAI_API_KEY);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!ENABLED)("copilot prompt-cache probe", () => {
  it("measures cached tokens per prompt layout", async () => {
    const model = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(COPILOT_FAST_MODEL);
    const stable = [COPILOT_RULES, renderKnowledge(readKnowledgeDrafts().map((note) => ({ id: note.id, titulo: note.titulo, body: note.body })))].join("\n\n---\n\n");
    const tools = buildCopilotTools("store-probe");
    const extra = { ...tools, herramientaExtra: tool({ description: "Herramienta de prueba que nunca se llama.", inputSchema: z.object({ id: z.string() }), execute: async () => null }) };
    const user: ModelMessage = { role: "user", content: "Responde solo: ok" };

    const call = async (label: string, system: string, messages: ModelMessage[], toolSet: Record<string, unknown> = tools) => {
      const result = await generateText({
        model,
        system,
        messages,
        allowSystemInMessages: true,
        tools: toolSet,
        toolChoice: "none",
        maxOutputTokens: 16,
        maxRetries: 0,
        providerOptions: { openai: { store: false, reasoningEffort: "none", promptCacheKey: "copiloto:probe" } },
      } as never);
      const row = { label, input: result.usage.inputTokens ?? 0, cached: result.usage.inputTokenDetails?.cacheReadTokens ?? 0 };
      console.info("[CACHE_PROBE]", JSON.stringify(row));
      await sleep(2500);
      return row;
    };

    const context = (minute: string) => `Hoy es lunes 12 de octubre de 2026, 16:${minute} (hora de Colombia).`;
    const rows = [
      await call("A warm: one system message, time at the end", `${stable}\n\n---\n\n${context("12")}`, [user]),
      await call("A same prompt again", `${stable}\n\n---\n\n${context("12")}`, [user]),
      await call("A only the minute changed (tail of the same system message)", `${stable}\n\n---\n\n${context("13")}`, [user]),
      await call("B warm: stable system + context as a second system message", stable, [{ role: "system", content: context("14") }, user]),
      await call("B second message changed (minute)", stable, [{ role: "system", content: context("15") }, user]),
      await call("B second message gains a skill block", stable, [{ role: "system", content: `Habilidad cargada: descripciones.\n${"x ".repeat(400)}\n${context("16")}` }, user]),
      await call("C same as B but one extra tool in the list", stable, [{ role: "system", content: context("17") }, user], extra),
    ];
    const out = path.resolve(__dirname, "../../tmp/copilot-eval");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "cache-probe.json"), JSON.stringify(rows, null, 2));
    expect(rows.every((row) => row.input > 0)).toBe(true);
  });
});
