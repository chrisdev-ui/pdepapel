import { tool } from "ai";
import { z } from "zod";

import { COPILOT_SKILL_IDS, getCopilotSkill, renderSkillBlock } from "@/lib/copiloto/skills";
import { productoParaDescripcionTool } from "@/lib/copiloto/skills/descripciones-tool";
import { kitsParaRotarTool } from "@/lib/copiloto/skills/kits-tool";
import { textosDeKitsTool } from "@/lib/copiloto/skills/kits-texts";
import { requireStoreOwner } from "@/lib/store-access";

type SkillNote = { id: string; titulo: string; body: string };

/**
 * `cargarHabilidad` y las herramientas de las habilidades. Todas quedan
 * registradas (el historial puede traer llamadas a cualquiera); cuáles ve el
 * modelo en cada paso lo decide `activeToolNames` en la ruta del chat.
 */
export function buildSkillTools(
  storeId: string,
  options: { alreadyLoaded: string[]; blocked?: string[]; notesFor: (skillId: string) => Promise<SkillNote[]> },
) {
  return {
    cargarHabilidad: tool({
      description:
        "Carga una habilidad del índice de habilidades: devuelve sus instrucciones y sus notas aprobadas, y activa sus herramientas por el resto de la conversación.",
      inputSchema: z.object({ id: z.string().trim().min(1).max(40) }),
      execute: async ({ id }) => {
        await requireStoreOwner(storeId);
        const skill = getCopilotSkill(id.trim().toLowerCase());
        if (!skill) return { ok: false, error: `No existe la habilidad «${id}».`, validas: COPILOT_SKILL_IDS };
        if (options.blocked?.includes(skill.id)) {
          return { ok: false, bloqueada: true, id: skill.id, error: "Paula desactivó esta habilidad en esta conversación: responde sin ella y no la vuelvas a cargar." };
        }
        if (options.alreadyLoaded.includes(skill.id)) {
          return { ok: true, id: skill.id, yaCargada: true, nota: "Ya estaba cargada en esta conversación: sus instrucciones están arriba." };
        }
        return {
          ok: true,
          id: skill.id,
          nombre: skill.nombre,
          instrucciones: renderSkillBlock(skill, await options.notesFor(skill.id)),
          herramientas: skill.herramientas,
        };
      },
    }),
    productoParaDescripcion: productoParaDescripcionTool(storeId),
    kitsParaRotar: kitsParaRotarTool(storeId),
    textosDeKits: textosDeKitsTool(),
  };
}
