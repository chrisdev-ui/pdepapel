import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { parseSkillCommand, parseSkillEvent, resolveSkillState, type SkillEventPayload } from "@/lib/copiloto/skill-state";

const ev = (action: SkillEventPayload["action"], skillId: string | null): SkillEventPayload => ({ action, skillId, modelChosenSkills: [], messageId: null });

describe("estado de las habilidades de una conversación", () => {
  it("sin correcciones: las que eligió el copiloto", () => {
    expect(resolveSkillState({ modelChosen: ["marketing"], events: [] })).toEqual({ loaded: ["marketing"], pinned: [], blocked: [], modelChosen: ["marketing"] });
  });

  it("quitar bloquea aunque el copiloto la haya elegido; agregar la desbloquea y la deja fija", () => {
    const events = [ev("removed", "marketing"), ev("added", "descripciones"), ev("regenerated", null)];
    expect(resolveSkillState({ modelChosen: ["marketing"], events })).toEqual({
      loaded: ["descripciones"],
      pinned: ["descripciones"],
      blocked: ["marketing"],
      modelChosen: ["marketing"],
    });
    const again = [...events, ev("added", "marketing"), ev("removed", "descripciones")];
    expect(resolveSkillState({ modelChosen: ["marketing"], events: again })).toEqual({
      loaded: ["marketing"],
      pinned: ["marketing"],
      blocked: ["descripciones"],
      modelChosen: ["marketing"],
    });
  });

  it("es determinista y no inventa habilidades", () => {
    const events = [ev("added", "inventada"), ev("removed", null), ev("added", "marketing")];
    const first = resolveSkillState({ modelChosen: ["otra", "descripciones"], events });
    expect(resolveSkillState({ modelChosen: ["otra", "descripciones"], events })).toEqual(first);
    expect(first).toEqual({ loaded: ["descripciones", "marketing"], pinned: ["marketing"], blocked: [], modelChosen: ["descripciones"] });
  });

  it("la fila guarda solo acción, habilidad, lo que eligió el copiloto y el mensaje", () => {
    expect(parseSkillEvent({ action: "removed", skillId: "marketing", modelChosenSkills: ["marketing", 3], messageId: "a1", nota: "x" })).toEqual({
      action: "removed",
      skillId: "marketing",
      modelChosenSkills: ["marketing"],
      messageId: "a1",
    });
    expect(parseSkillEvent({ action: "borrar" })).toBeNull();
    expect(parseSkillEvent([{ type: "text" }])).toBeNull();
  });
});

describe("órdenes escritas", () => {
  it.each([
    ["no uses marketing", "removed", "marketing"],
    ["No uses Marketing, por favor.", "removed", "marketing"],
    ["quita marketing", "removed", "marketing"],
    ["deja de usar mercadeo", "removed", "marketing"],
    ["usa descripciones", "added", "descripciones"],
    ["Usa la habilidad de descripción", "added", "descripciones"],
    ["¡activa marketing!", "added", "marketing"],
  ])("«%s» → %s %s", (text, action, skillId) => {
    expect(parseSkillCommand(text)).toEqual({ action, skillId });
  });

  it.each([
    "¿Tienen el Marketing planner?",
    "usa el marketing planner para organizar",
    "usa marketing planner",
    "no uses marketing para la descripción del set",
    "quiero una descripción del set de plumígrafos",
    "dame ideas de marketing",
    "marketing",
  ])("«%s» no es una orden", (text) => {
    expect(parseSkillCommand(text)).toBeNull();
  });
});

describe("las filas de corrección nunca salen por un lector de mensajes", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (name === "node_modules" || name.startsWith(".")) return [];
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });

  // La retención cuenta lo que va a borrar: ahí sí entran las correcciones, que se borran con la conversación.
  const ALLOWED = new Set(["lib/copiloto/retention.ts: count"]);

  it("cada lectura de assistantMessage filtra por rol", () => {
    const offenders: string[] = [];
    for (const file of [...files(path.join(ROOT, "app")), ...files(path.join(ROOT, "lib")), ...files(path.join(ROOT, "scripts"))]) {
      const source = readFileSync(file, "utf8");
      const reads = source.matchAll(/assistantMessage\s*\.\s*(findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/g);
      for (const read of Array.from(reads)) {
        const call = source.slice(read.index!, read.index! + 400);
        const isById = /findUnique/.test(read[1]) && /where:\s*\{\s*id\b/.test(call);
        const label = `${path.relative(ROOT, file)}: ${read[1]}`;
        if (!/\brole\b/.test(call) && !isById && !ALLOWED.has(label)) offenders.push(label);
      }
    }
    expect(offenders).toEqual([]);
  });
});
