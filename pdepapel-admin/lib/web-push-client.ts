/**
 * Mensajes del botón «Activar avisos en este aparato». Antes todo fallo del
 * navegador decía «No se pudieron activar los avisos», sin saber en qué paso
 * ni por qué; en iPhone, Safari sin instalar decía «Este navegador no admite
 * avisos» sin decir qué hacer.
 */

export type PushStep = "permission" | "register" | "subscribe" | "save";

export interface PushEnvironment {
  userAgent: string;
  /** `display-mode: standalone` o `navigator.standalone` (iOS). */
  standalone: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  hasNotification: boolean;
}

export const isAppleMobile = (userAgent: string) => /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile\//i.test(userAgent));

const iosVersion = (userAgent: string): number | null => {
  const match = userAgent.match(/OS (\d+)[_.](\d+)/);
  return match ? Number(match[1]) + Number(match[2]) / 100 : null;
};

export const IOS_INSTALL_TEXT =
  "En iPhone o iPad los avisos solo funcionan desde el ícono: en Safari, «Compartir» › «Agregar a pantalla de inicio», abre el panel desde ese ícono y actívalos ahí.";
export const IOS_TOO_OLD_TEXT = "Este iPhone o iPad necesita iOS 16.4 o más reciente para recibir avisos del panel.";
export const UNSUPPORTED_TEXT = "Este navegador no admite avisos.";

/** Por qué no se puede ni intentar, o `null` si el navegador puede. */
export function unsupportedReason(env: PushEnvironment): string | null {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return null;
  if (isAppleMobile(env.userAgent)) {
    const version = iosVersion(env.userAgent);
    if (version !== null && version < 16.04) return IOS_TOO_OLD_TEXT;
    if (!env.standalone) return IOS_INSTALL_TEXT;
  }
  return UNSUPPORTED_TEXT;
}

const errorName = (error: unknown) =>
  error && typeof error === "object" && "name" in error && typeof (error as { name: unknown }).name === "string" ? (error as { name: string }).name : "Error";

/** Mensaje para la dueña según el paso y el tipo de error (nunca el texto crudo del navegador). */
export function describePushFailure(step: PushStep, error: unknown, apiMessage?: string | null): string {
  if (step === "save") return apiMessage || "El panel no pudo guardar este aparato. Vuelve a intentar en un momento.";
  const name = errorName(error);
  if (name === "NotAllowedError") {
    return "El teléfono no dio permiso para avisos. En iPhone: Ajustes › Notificaciones › P de Papel › Permitir; en Android o computador, los permisos del sitio en el navegador.";
  }
  if (step === "register") return `No se pudo instalar el servicio de avisos del panel (${name}). Cierra el panel, ábrelo de nuevo desde el ícono y vuelve a intentar.`;
  if (step === "subscribe") {
    return `El servicio de avisos del teléfono no respondió (${name}). Revisa la conexión, cierra y vuelve a abrir el panel desde el ícono, e inténtalo otra vez.`;
  }
  return `No se pudieron activar los avisos (${name}).`;
}

const NOT_CONFIGURED_HINT: Record<string, string> = {
  missing_public: "falta NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
  missing_private: "falta WEB_PUSH_VAPID_PRIVATE_KEY",
  missing_subject: "falta WEB_PUSH_VAPID_SUBJECT",
  bad_subject_format: "WEB_PUSH_VAPID_SUBJECT debe empezar con «mailto:» o «https://»",
  bad_public_key_format: "la llave pública VAPID no tiene la forma esperada (87 caracteres, empieza con «B», sin comillas)",
  bad_private_key_format: "la llave privada VAPID no tiene la forma esperada (43 caracteres, sin comillas)",
};

/** «No configurado» con una pista según el motivo que manda el panel (sin valores). */
export function notConfiguredText(reason: string | null | undefined): string {
  const hint = reason ? NOT_CONFIGURED_HINT[reason] : undefined;
  return hint
    ? `No configurado: ${hint}. Corrígelo en Vercel (Production) y vuelve a desplegar.`
    : "No configurado: al panel le faltan las llaves de los avisos.";
}
