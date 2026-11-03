/**
 * Lo que se escribe en los registros de Vercel no lleva datos de clientas: ni nombre, correo, celular,
 * dirección ni documento. Los registros llevan ids, referencias de pedido y el código o motivo del
 * error; el pedido completo se mira en el panel.
 *
 * Incidente 2026-11-03: el error de una guía de EnvioClick escribió el destinatario completo (nombre,
 * correo, celular y dirección) en los registros, y el registro previo a cada guía lo hacía siempre.
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Celulares (3xx) y fijos (60x) de Colombia, con o sin +57. Sin guion o letra pegados, para no tocar
// referencias como ORD-1793673348281-170 ni ids.
const PHONE = /(?<![\w-])(?:\+?57[\s.-]?)?(?:3\d{2}|60\d)[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])/g;
const DOCUMENT_WITH_LABEL = /\b(c[ée]dula|documento|document|nit|c\.?c\.?)(\s*(?:n[°ºo.]*)?\s*[:#]?\s*)\d[\d.\s-]{4,}\d/gi;
const DOTTED_DOCUMENT = /(?<![\w.-])\d{1,3}(?:\.\d{3}){2,3}(?:-\d)?(?![\w.-])/g;
const ADDRESS =
  /\b(?:calle|cll?|carrera|cra|kra?|cr|avenida|av|diagonal|dg|transversal|tv|autopista|circular|manzana|mz)\.?\s*\d+\s*[a-z]{0,3}(?:\s*(?:bis|sur|norte|este|oeste))*\s*(?:#|no\.?|n°|nº)\s*\d+\s*[a-z]{0,3}(?:\s*-\s*\d+\w*)?/gi;

const DEFAULT_MAX = 500;

/** Texto libre (mensajes de error, de proveedores o de clientas) listo para un registro. */
export function redactLogText(value: unknown, max = DEFAULT_MAX): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = text
    .replace(EMAIL, "[correo]")
    .replace(ADDRESS, "[dirección]")
    .replace(DOCUMENT_WITH_LABEL, "$1$2[documento]")
    .replace(DOTTED_DOCUMENT, "[documento]")
    .replace(PHONE, "[número]");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Un PrismaClientValidationError copia en el mensaje todos los argumentos de la consulta, con sus
 * valores (nombre, correo, dirección del pedido). Se queda la primera línea («Invalid `prisma.x()`
 * invocation») y el motivo del final.
 */
export function summarizePrismaValidationMessage(message: string): string {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const head = lines.find((line) => /^Invalid `/.test(line)) ?? lines[0] ?? "";
  const reason = lines[lines.length - 1] ?? "";
  return redactLogText(head === reason ? head : `${head} … ${reason}`);
}

/** Lo que Prisma emite en su canal `error` (probado 2026-11-03: un error de validación trae los valores). */
export function prismaLogMessage(message: string): string {
  return /Invalid `[^`]*` invocation/.test(message) ? summarizePrismaValidationMessage(message) : redactLogText(message);
}

/** Los clientes de Prisma emiten `error` como evento y lo escriben aquí, ya limpio. */
export function logPrismaErrorEvent(event: { message: string }): void {
  console.error("prisma:error", prismaLogMessage(event.message));
}

export interface SafeError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  /** Primeros marcos del stack, sin la línea del mensaje. */
  at?: string[];
}

/**
 * Lo único que se registra de un error: nombre, mensaje limpio, código y estado. Nunca el objeto
 * entero, porque `console.error(error)` imprime también sus propiedades (`originalError`,
 * `response.data`, la petición) y ahí viajan los datos de la clienta.
 */
export function safeError(error: unknown): SafeError {
  if (!(error instanceof Error)) {
    return { name: typeof error, message: redactLogText(error) };
  }
  const anyError = error as Error & { code?: unknown; statusCode?: unknown; status?: unknown; response?: { status?: unknown } };
  const message =
    error.name === "PrismaClientValidationError" ? summarizePrismaValidationMessage(error.message) : redactLogText(error.message);
  const status = [anyError.statusCode, anyError.status, anyError.response?.status].find((value) => typeof value === "number") as number | undefined;
  const at = error.stack
    ?.split("\n")
    .slice(1, 4)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "));
  return {
    name: error.name,
    message,
    ...(typeof anyError.code === "string" ? { code: anyError.code } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(at?.length ? { at } : {}),
  };
}

interface ShipmentParamsLike {
  idRate?: number | null;
  packages?: { weight?: number | string }[];
  origin?: { daneCode?: string | null };
  destination?: { daneCode?: string | null };
  codValue?: number | null;
  contentValue?: number | null;
  requestPickup?: boolean;
}

/** Una petición de guía de EnvioClick sin origen ni destinatario: solo tarifa, paquetes y municipios. */
export function shipmentLogSummary(params: ShipmentParamsLike) {
  return {
    idRate: params.idRate ?? null,
    packages: params.packages?.length ?? 0,
    weight: params.packages?.reduce((total, item) => total + (Number(item.weight) || 0), 0) ?? 0,
    originDane: params.origin?.daneCode ?? null,
    destinationDane: params.destination?.daneCode ?? null,
    isCOD: typeof params.codValue === "number" && params.codValue > 0,
    contentValue: params.contentValue ?? null,
    requestPickup: params.requestPickup ?? null,
  };
}
