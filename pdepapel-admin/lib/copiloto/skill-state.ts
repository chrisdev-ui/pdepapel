import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { COPILOT_SKILL_IDS, getCopilotSkill, loadedSkillIds } from "@/lib/copiloto/skills";

/**
 * Lo que Paula corrige a mano de las habilidades de una conversación: quitar
 * una que el copiloto eligió (queda bloqueada), agregar una que no eligió
 * (queda fija) o pedir que responda de nuevo. Cada corrección es una fila de
 * `AssistantMessage` con rol «skill-event», sin texto libre ni datos de
 * clientas; el modelo y la pantalla del chat nunca la ven.
 */
export const SKILL_EVENT_ROLE = "skill-event";
/** Los únicos roles que son conversación: cualquier lectura de mensajes filtra por estos. */
export const COPILOT_VISIBLE_ROLES = ["user", "assistant"] as const;

export type SkillEventAction = "added" | "removed" | "regenerated";

export interface SkillEventPayload {
  action: SkillEventAction;
  skillId: string | null;
  /** Las que había elegido el copiloto en ese momento. */
  modelChosenSkills: string[];
  /** La respuesta (o la pregunta) a la que se refiere la corrección. */
  messageId: string | null;
}

export interface SkillState {
  /** Las que van al modelo: elegidas por el copiloto o fijadas por Paula, menos las bloqueadas. */
  loaded: string[];
  pinned: string[];
  blocked: string[];
  /** Las que eligió el copiloto, antes de las correcciones. */
  modelChosen: string[];
}

export function parseSkillEvent(parts: unknown): SkillEventPayload | null {
  const value = parts as Partial<SkillEventPayload> | null;
  if (!value || typeof value !== "object" || !["added", "removed", "regenerated"].includes(String(value.action))) return null;
  return {
    action: value.action as SkillEventAction,
    skillId: typeof value.skillId === "string" ? value.skillId : null,
    modelChosenSkills: Array.isArray(value.modelChosenSkills) ? value.modelChosenSkills.filter((id): id is string => typeof id === "string") : [],
    messageId: typeof value.messageId === "string" ? value.messageId : null,
  };
}

/** Determinista: el orden de los eventos decide; la última corrección de cada habilidad gana. */
export function resolveSkillState(input: { modelChosen: string[]; events: SkillEventPayload[] }): SkillState {
  const pinned = new Set<string>();
  const blocked = new Set<string>();
  for (const event of input.events) {
    if (!event.skillId || !getCopilotSkill(event.skillId)) continue;
    if (event.action === "added") {
      pinned.add(event.skillId);
      blocked.delete(event.skillId);
    } else if (event.action === "removed") {
      blocked.add(event.skillId);
      pinned.delete(event.skillId);
    }
  }
  const ordered = (set: Set<string>) => COPILOT_SKILL_IDS.filter((id) => set.has(id));
  const modelChosen = COPILOT_SKILL_IDS.filter((id) => input.modelChosen.includes(id));
  const loaded = new Set(modelChosen.concat(Array.from(pinned)).filter((id) => !blocked.has(id)));
  return { loaded: ordered(loaded), pinned: ordered(pinned), blocked: ordered(blocked), modelChosen };
}

/** Dos lecturas por conversación, sobre el índice (conversationId, createdAt). */
export async function readSkillState(conversationId: string): Promise<SkillState> {
  const [answers, events] = await Promise.all([
    prismadb.assistantMessage.findMany({ where: { conversationId, role: "assistant" }, orderBy: { createdAt: "asc" }, select: { parts: true } }),
    prismadb.assistantMessage.findMany({ where: { conversationId, role: SKILL_EVENT_ROLE }, orderBy: { createdAt: "asc" }, select: { parts: true } }),
  ]);
  return resolveSkillState({
    modelChosen: loadedSkillIds(answers),
    events: events.map((row) => parseSkillEvent(row.parts)).filter((event): event is SkillEventPayload => Boolean(event)),
  });
}

export async function recordSkillEvent(conversationId: string, payload: SkillEventPayload, at: Date = new Date()) {
  const clean: SkillEventPayload = {
    action: payload.action,
    skillId: payload.skillId && getCopilotSkill(payload.skillId) ? payload.skillId : null,
    modelChosenSkills: payload.modelChosenSkills.filter((id) => getCopilotSkill(id)),
    messageId: payload.messageId,
  };
  await prismadb.assistantMessage.create({
    data: {
      id: `ske_${randomBytes(12).toString("hex")}`,
      conversationId,
      role: SKILL_EVENT_ROLE,
      parts: clean as unknown as Prisma.InputJsonValue,
      createdAt: at,
    },
  });
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¡!¿?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIASES: Record<string, string[]> = {
  descripciones: ["descripciones", "descripcion", "fichas"],
  kits: ["kits", "kits para rotar", "rotar inventario"],
  marketing: ["marketing", "mercadeo"],
  precios: ["precios", "precio", "calculadora", "packs"],
};
const REMOVE = "(?:no uses|no use|no usar|quita|quitar|desactiva|deja de usar)";
const ADD = "(?:usa|use|usar|activa|carga|pon)";
const TAIL = "(?: por favor| porfa)?";

/**
 * «no uses marketing», «quita marketing», «usa descripciones»: el mensaje
 * entero tiene que ser la orden, para que «¿tienen el Marketing planner?» o
 * «usa el marketing planner» nunca la disparen.
 */
export function parseSkillCommand(text: string): { action: "added" | "removed"; skillId: string } | null {
  const folded = fold(text);
  for (const [skillId, aliases] of Object.entries(ALIASES)) {
    const names = aliases.join("|");
    if (new RegExp(`^${REMOVE} (?:la habilidad (?:de )?)?(?:${names})${TAIL}$`).test(folded)) return { action: "removed", skillId };
    if (new RegExp(`^${ADD} (?:la habilidad (?:de )?)?(?:${names})${TAIL}$`).test(folded)) return { action: "added", skillId };
  }
  return null;
}
