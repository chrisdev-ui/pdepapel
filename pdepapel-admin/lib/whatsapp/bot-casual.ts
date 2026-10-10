import { createHash } from "node:crypto";

import { TALK_TO_OWNER_BUTTON_TITLE } from "@/lib/whatsapp/bot-replies";

/**
 * Lo que el bot contesta a la conversación de cortesía: gracias, despedida,
 * «¿eres un robot?» y «¿qué venden?». La IA solo elige cuál; el texto es
 * fijo y sale únicamente con el visto bueno de Paula en Respuestas, con su
 * propia versión: editar uno retira solo esta aprobación, no la de los datos
 * del negocio ni la de productos. Sin aprobación, el bot sigue como antes.
 */
export const CASUAL_TEMPLATES = {
  thanks: () => `¡Con mucho gusto! 💛 Si necesitas algo más, aquí estoy.`,
  goodbye: () => `¡Gracias por escribirnos! Que tengas un lindo día 💛`,
  bot_identity: () =>
    `Soy el asistente virtual de P de Papel 🤖💛 Si prefieres hablar con Paula, toca "${TALK_TO_OWNER_BUTTON_TITLE}".`,
  catalog_question: () =>
    `Tenemos papelería bonita: cuadernos, agendas, marcadores, washi tape, stickers, kits y regalos 💛`,
} as const;
export type CasualIntent = keyof typeof CASUAL_TEMPLATES;

export const CASUAL_TEMPLATES_VERSION = createHash("sha256")
  .update(
    Object.entries(CASUAL_TEMPLATES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, render]) => `${key}:${render()}`)
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 32);

export function isCasualIntent(intent: string): intent is CasualIntent {
  return Object.prototype.hasOwnProperty.call(CASUAL_TEMPLATES, intent);
}

export function areCasualRepliesApproved(s: {
  botCasualApprovedAt: Date | null;
  botCasualVersion: string | null;
}): boolean {
  return (
    Boolean(s.botCasualApprovedAt) &&
    s.botCasualVersion === CASUAL_TEMPLATES_VERSION
  );
}

export function previewCasualTemplates(): { label: string; text: string }[] {
  return [
    { label: "Da las gracias", text: CASUAL_TEMPLATES.thanks() },
    { label: "Se despide", text: CASUAL_TEMPLATES.goodbye() },
    {
      label: "Pregunta si habla con un robot o con una persona",
      text: CASUAL_TEMPLATES.bot_identity(),
    },
    {
      label: "Pregunta qué venden (después va el enlace al catálogo)",
      text: CASUAL_TEMPLATES.catalog_question(),
    },
  ];
}

/**
 * El enlace al catálogo va en un mensaje aparte, después del menú de
 * bienvenida y del «Esa no me la sé»: así no se toca el texto aprobado de la
 * bienvenida, y un botón de enlace no puede compartir mensaje con «Hablar con
 * Paula». `cta_url` manda un botón que abre el enlace; `text`, el enlace
 * escrito (WhatsApp lo vuelve tocable). El botón se confirmó con un envío
 * controlado el 2026-10-10: Chakra lo pasa a Meta y llegó tocable.
 */
export const CATALOG_LINK_MODE: "text" | "cta_url" = "cta_url";
export const CATALOG_MESSAGE_BODY = "Aquí puedes ver todo nuestro catálogo 👇";
export const CATALOG_BUTTON_TEXT = "Ver catálogo";
/** Después de una lista de productos: el mismo tono, apuntando a esa búsqueda. */
export const SEARCH_LINK_BODY = "Aquí los puedes ver en la tienda 👇";
export const SEARCH_BUTTON_TEXT = "Ver en la tienda";

const UTM = { utm_source: "whatsapp", utm_medium: "bot" } as const;

function storeUrl(base: string, path: string, params: Record<string, string>) {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildCatalogUrl(base: string): string {
  return storeUrl(base, "tienda", { ...UTM, utm_campaign: "ver_catalogo" });
}

export function buildSearchUrl(
  base: string,
  search: { query: string; budget?: number | null },
): string {
  return storeUrl(base, "tienda", {
    search: search.query,
    ...(search.budget ? { maxPrice: String(search.budget) } : {}),
    ...UTM,
    utm_campaign: "busqueda",
  });
}
