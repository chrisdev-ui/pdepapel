/** Nombre y resumen de cada habilidad; liviano para usarlo en el navegador (chips y menú del chat). */
export const COPILOT_SKILL_CATALOG: readonly { id: string; nombre: string; resumen: string }[] = [
  {
    id: "descripciones",
    nombre: "Descripciones",
    resumen: "escribir o mejorar descripciones de producto para la tienda en línea (ficha, SEO, viñetas), del catálogo o prospectos.",
  },
  {
    id: "kits",
    nombre: "Kits para rotar",
    resumen: "productos lentos (sin ventas en N días) y kits para rotarlos con piezas que sí se venden: precio sugerido, margen y ocasión.",
  },
  {
    id: "marketing",
    nombre: "Marketing",
    resumen: "estrategia de contenido y redes: ideas, guiones de Reels o TikTok, textos de publicación, calendario, anuncios y pauta, y colaboraciones.",
  },
  {
    id: "precios",
    nombre: "Precios",
    resumen: "a cuánto vender un producto según su costo (tienda y Mercado Libre), qué tamaños de pack convienen y qué productos quedan por debajo de un margen.",
  },
];

export const COPILOT_SKILL_NAMES: Record<string, string> = Object.fromEntries(COPILOT_SKILL_CATALOG.map((skill) => [skill.id, skill.nombre]));
