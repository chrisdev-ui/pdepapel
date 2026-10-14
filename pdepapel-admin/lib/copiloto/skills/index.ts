import { MARKETING_SKILL_INSTRUCTIONS } from "@/lib/copiloto/marketing-mode";
import { DESCRIPTIONS_SKILL_INSTRUCTIONS } from "@/lib/copiloto/skills/descripciones";
import { KITS_SKILL_INSTRUCTIONS } from "@/lib/copiloto/skills/kits";
import { COPILOT_SKILL_CATALOG } from "@/lib/copiloto/skills/names";

/**
 * Habilidades del copiloto (carga bajo demanda). El prompt fijo solo lleva el
 * índice de abajo; el modelo carga una habilidad con `cargarHabilidad` y desde
 * ahí recibe sus instrucciones, sus notas y sus herramientas durante el resto
 * de la conversación. Agregar un dominio es agregar una entrada aquí, no un
 * botón en la pantalla.
 */
export interface CopilotSkill {
  id: string;
  nombre: string;
  /** Una línea: es lo único que viaja en cada mensaje. */
  resumen: string;
  instrucciones: string;
  /** Herramientas que solo se ofrecen al modelo con la habilidad cargada. */
  herramientas: readonly string[];
  version: number;
}

const catalog = (id: string) => {
  const entry = COPILOT_SKILL_CATALOG.find((skill) => skill.id === id);
  if (!entry) throw new Error(`Falta la habilidad ${id} en names.ts`);
  return entry;
};

/** Ordenadas por id: el índice tiene que salir idéntico en cada mensaje (caché). */
export const COPILOT_SKILLS: readonly CopilotSkill[] = [
  {
    ...catalog("descripciones"),
    instrucciones: DESCRIPTIONS_SKILL_INSTRUCTIONS,
    herramientas: ["productoParaDescripcion"],
    version: 1,
  },
  {
    ...catalog("kits"),
    instrucciones: KITS_SKILL_INSTRUCTIONS,
    herramientas: ["kitsParaRotar"],
    version: 1,
  },
  {
    ...catalog("marketing"),
    instrucciones: MARKETING_SKILL_INSTRUCTIONS,
    herramientas: [],
    version: 1,
  },
];

export const COPILOT_SKILL_IDS = COPILOT_SKILLS.map((skill) => skill.id);
export const SKILL_TOOL_NAMES = Array.from(new Set(COPILOT_SKILLS.flatMap((skill) => skill.herramientas)));

export const getCopilotSkill = (id: string) => COPILOT_SKILLS.find((skill) => skill.id === id) ?? null;

export function renderSkillIndex(): string {
  return [
    "Habilidades (se cargan bajo demanda):",
    ...COPILOT_SKILLS.map((skill) => `- ${skill.id}: ${skill.resumen}`),
    "Antes de responder un pedido del tema de una habilidad, llama cargarHabilidad con su id; puedes cargar más de una. Si ya aparece como cargada en esta conversación, no la vuelvas a cargar. Para lo demás (ventas, pedidos, inventario, dudas del oficio) no cargues ninguna.",
  ].join("\n");
}

/** Lo que dejó escrito cada `cargarHabilidad` exitoso en los mensajes guardados. */
export function loadedSkillIds(messages: { parts: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of Array.isArray(message.parts) ? message.parts : []) {
      const value = part as { type?: string; state?: string; output?: { ok?: boolean; id?: string } };
      if (value?.type === "tool-cargarHabilidad" && value.state === "output-available" && value.output?.ok && value.output.id && getCopilotSkill(value.output.id)) {
        ids.add(value.output.id);
      }
    }
  }
  return COPILOT_SKILL_IDS.filter((id) => ids.has(id));
}

/** Herramientas activas: las de siempre más las de las habilidades cargadas, en orden fijo. */
export function activeToolNames(baseTools: readonly string[], loaded: Iterable<string>): string[] {
  const loadedSet = new Set(loaded);
  const extra = COPILOT_SKILLS.filter((skill) => loadedSet.has(skill.id)).flatMap((skill) => skill.herramientas);
  return [...baseTools, "cargarHabilidad", ...extra];
}

/** Las notas aprobadas de una habilidad, con el mismo formato que el conocimiento general. */
export function renderSkillBlock(skill: CopilotSkill, notes: { id: string; titulo: string; body: string }[]): string {
  return [
    skill.instrucciones,
    notes.length
      ? ["Notas aprobadas de esta habilidad (cítalas con su id):", ...notes.map((note) => `[conocimiento: ${note.id}] ${note.titulo}\n${note.body}`)].join("\n\n")
      : "Esta habilidad todavía no tiene notas aprobadas por Paula.",
  ].join("\n\n");
}
