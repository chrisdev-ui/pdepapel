/**
 * Escáner remoto: reglas puras de la vinculación entre una pantalla del panel
 * y un celular. Sin dependencias de Node ni de Prisma: se usan en las rutas,
 * en la pantalla y en la página del celular.
 *
 * El código corto solo empareja sesiones; la seguridad la pone Clerk: el
 * celular tiene que entrar con la misma cuenta del panel.
 */

/** Sin 0/O ni 1/I/L, que se confunden al dictarlos o escribirlos. */
export const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_LENGTH = 6;
/** Diez minutos sin actividad; cada lectura los renueva. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Cada cuánto pregunta la pantalla por lecturas nuevas. */
/**
 * Lo que la ventana de vinculación deja ver «Celular vinculado» antes de
 * cerrarse sola. Suficiente para leerlo, poco para no estorbar.
 */
export const PAIRED_DIALOG_AUTOCLOSE_MS = 1200;

export const REMOTE_SCAN_POLL_MS = 1500;

/**
 * Ritmo mientras hay un celular vinculado. Con 1500 ms una lectura tardaba
 * hasta segundo y medio en aparecer en la venta y parecía que no había
 * entrado. Solo corre cuando de verdad se está escaneando —la vinculación
 * vence a los 10 minutos sin actividad—, así que el gasto sigue acotado.
 */
export const REMOTE_SCAN_ACTIVE_POLL_MS = 700;
/** Cuántas lecturas devuelve una consulta como máximo. */
export const REMOTE_SCAN_PAGE = 50;

export type ScannerSessionStatus = "waiting" | "paired" | "expired" | "revoked";

export interface ScannerSessionLike {
  pairedAt: Date | string | null;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  pairingToken?: string | null;
}

const toMs = (value: Date | string) => (value instanceof Date ? value.getTime() : Date.parse(value));

export function generatePairingCode(
  randomIndex: (bound: number) => number = (bound) => Math.floor(Math.random() * bound),
) {
  let code = "";
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_CODE_ALPHABET[randomIndex(PAIRING_CODE_ALPHABET.length)];
  }
  return code;
}

/** Lo que escribe la persona: mayúsculas, sin espacios ni guiones. */
export function normalizePairingCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, PAIRING_CODE_LENGTH);
}

export function isValidPairingCode(code: string) {
  return code.length === PAIRING_CODE_LENGTH && code.split("").every((char) => PAIRING_CODE_ALPHABET.includes(char));
}

/** «K7P 4Q2»: más fácil de leer en la pantalla y de dictar. */
export function formatPairingCode(code: string) {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`.trim();
}

export function expiryFrom(now = Date.now()) {
  return new Date(now + PAIRING_TTL_MS);
}

export function sessionStatus(session: ScannerSessionLike, now = Date.now()): ScannerSessionStatus {
  if (session.revokedAt) return "revoked";
  if (toMs(session.expiresAt) <= now) return "expired";
  return session.pairedAt ? "paired" : "waiting";
}

export type PairingProblem = "EXPIRED" | "REVOKED";
export type ScanProblem = PairingProblem | "REPLACED" | "NOT_PAIRED";

/** Un celular puede vincularse mientras la sesión viva; volver a vincular reemplaza al anterior. */
export function pairingProblem(session: ScannerSessionLike, now = Date.now()): PairingProblem | null {
  const status = sessionStatus(session, now);
  if (status === "revoked") return "REVOKED";
  if (status === "expired") return "EXPIRED";
  return null;
}

/** Solo el celular con el token vigente puede enviar lecturas. */
export function scanProblem(session: ScannerSessionLike, token: string | null | undefined, now = Date.now()): ScanProblem | null {
  const problem = pairingProblem(session, now);
  if (problem) return problem;
  if (!session.pairedAt || !session.pairingToken) return "NOT_PAIRED";
  if (!token || token !== session.pairingToken) return "REPLACED";
  return null;
}

export const PROBLEM_MESSAGES: Record<ScanProblem, string> = {
  EXPIRED: "La vinculación venció por inactividad. Genera otro código en la pantalla.",
  REVOKED: "La pantalla desvinculó este celular.",
  REPLACED: "Otro celular tomó este código; este ya no envía lecturas.",
  NOT_PAIRED: "Este código todavía no tiene un celular vinculado.",
};

export function pairingUrl(origin: string, storeId: string, code: string) {
  return `${origin.replace(/\/$/, "")}/${storeId}/escaner?codigo=${encodeURIComponent(code)}`;
}

/** «iPhone · Safari»: lo que la pantalla muestra como celular vinculado. */
export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const device = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Macintosh/i.test(ua)
          ? "Mac"
          : /Windows/i.test(ua)
            ? "Windows"
            : "Celular";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Firefox\//i.test(ua)
      ? "Firefox"
      : /Chrome\//i.test(ua) || /CriOS/i.test(ua)
        ? "Chrome"
        : /Safari\//i.test(ua)
          ? "Safari"
          : null;
  return browser ? `${device} · ${browser}` : device;
}

/** «hace 12 s», «hace 3 min»: para la ventana de vinculación y el celular. */
export function relativeTime(at: Date | string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - toMs(at)) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

export function minutesLeft(expiresAt: Date | string, now = Date.now()) {
  return Math.max(0, Math.ceil((toMs(expiresAt) - now) / 60000));
}
