/** Nombre y resumen de cada habilidad; liviano para usarlo en el navegador (chips y menú del chat). */
export const COPILOT_SKILL_CATALOG: readonly { id: string; nombre: string; resumen: string }[] = [
  {
    id: "descripciones",
    nombre: "Descripciones",
    resumen: "escribir o mejorar descripciones de producto para la tienda en línea (ficha, SEO, viñetas), del catálogo o prospectos.",
  },
  {
    id: "marketing",
    nombre: "Marketing",
    resumen: "estrategia de contenido y redes: ideas, guiones de Reels o TikTok, textos de publicación, calendario, anuncios y pauta, y colaboraciones.",
  },
];

export const COPILOT_SKILL_NAMES: Record<string, string> = Object.fromEntries(COPILOT_SKILL_CATALOG.map((skill) => [skill.id, skill.nombre]));
